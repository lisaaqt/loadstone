import { compareVersions, PANEL_VERSION } from "@loadstone/shared";
import { env } from "./env";

export interface UpdateStatus {
  current: string;
  latest: string | null;
  outdated: boolean;
  checkedAt: string | null;
  error: string | null;
}

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
const RETRY_AFTER_ERROR_MS = 15 * 60 * 1000;
const SEMVER = /^v?\d+\.\d+\.\d+$/;

let cached: { status: UpdateStatus; at: number } | null = null;
let inflight: Promise<UpdateStatus> | null = null;

/** "registry.example.com/team/panel" → registry host and repository path (Docker Hub when there is no host part). */
function parseImage(image: string) {
  const ref = image.replace(/[:@].*$/, "");
  const [first, ...rest] = ref.split("/");
  const isHost = rest.length > 0 && (first!.includes(".") || first!.includes(":") || first === "localhost");
  if (!isHost) return { registry: "registry-1.docker.io", repository: rest.length ? ref : `library/${ref}` };
  return { registry: first!, repository: rest.join("/") };
}

/** Bearer token for registries that use token auth (Docker Hub, GHCR, Harbor…). */
async function bearerToken(challenge: string, repository: string, basic?: string) {
  const params = Object.fromEntries([...challenge.matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1]!, m[2]!]));
  if (!params.realm) throw new Error("registry asked for an unsupported authentication method");
  const url = new URL(params.realm);
  if (params.service) url.searchParams.set("service", params.service);
  url.searchParams.set("scope", params.scope ?? `repository:${repository}:pull`);
  const res = await fetch(url, { headers: basic ? { authorization: basic } : {}, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`token request failed (${res.status})`);
  const body = (await res.json()) as { token?: string; access_token?: string };
  return body.token ?? body.access_token ?? "";
}

/** Reads the image's tags from the registry (v2 API) and returns the highest x.y.z version. */
async function latestFromRegistry(): Promise<string | null> {
  const config = env();
  const { registry, repository } = parseImage(config.UPDATE_IMAGE);
  const basic =
    config.UPDATE_REGISTRY_USERNAME && config.UPDATE_REGISTRY_PASSWORD
      ? `Basic ${Buffer.from(`${config.UPDATE_REGISTRY_USERNAME}:${config.UPDATE_REGISTRY_PASSWORD}`).toString("base64")}`
      : undefined;
  const url = `https://${registry}/v2/${repository}/tags/list?n=1000`;
  let res = await fetch(url, { headers: basic ? { authorization: basic } : {}, signal: AbortSignal.timeout(10_000) });
  const challenge = res.headers.get("www-authenticate") ?? "";
  if (res.status === 401 && /^bearer/i.test(challenge)) {
    const token = await bearerToken(challenge, repository, basic);
    res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
  }
  if (res.status === 401) throw new Error("the registry needs a login: set UPDATE_REGISTRY_USERNAME and UPDATE_REGISTRY_PASSWORD");
  if (!res.ok) throw new Error(`registry responded with ${res.status}`);
  const tags = ((await res.json()) as { tags?: string[] | null }).tags ?? [];
  // Date-style tags (e.g. 2026.11.18 from older builds) are not releases and would always look newer.
  const versions = tags
    .filter((t) => SEMVER.test(t))
    .map((t) => t.replace(/^v/, ""))
    .filter((v) => Number.parseInt(v, 10) < 1000);
  return versions.sort(compareVersions).at(-1) ?? null;
}

/** Cached update status (checked at most every 6 hours, 15 minutes after an error). */
export async function updateStatus(force = false): Promise<UpdateStatus> {
  const base = { current: PANEL_VERSION, latest: null, outdated: false, checkedAt: null, error: null };
  if (!env().UPDATE_CHECK) return { ...base, error: "Update check is disabled (UPDATE_CHECK=false)" };
  if (!force && cached && Date.now() - cached.at < (cached.status.error ? RETRY_AFTER_ERROR_MS : CHECK_EVERY_MS)) return cached.status;
  inflight ??= (async () => {
    let status: UpdateStatus;
    try {
      const latest = await latestFromRegistry();
      status = { ...base, latest, outdated: latest !== null && compareVersions(latest, PANEL_VERSION) > 0, checkedAt: new Date().toISOString() };
    } catch (err) {
      status = { ...base, checkedAt: new Date().toISOString(), error: err instanceof Error ? err.message : String(err) };
    }
    cached = { status, at: Date.now() };
    return status;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
