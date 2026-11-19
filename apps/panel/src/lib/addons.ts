import { ALLOWED_DOWNLOAD_HOSTS, PANEL_VERSION, SOFTWARE, type SoftwareId } from "@loadstone/shared";
import { ApiError } from "./api";

const UA = `loadstone-panel/${PANEL_VERSION} (self-hosted Minecraft panel)`;
const MODRINTH = "https://api.modrinth.com/v2";
const HANGAR = "https://hangar.papermc.io/api/v1";

export type AddonSource = "MODRINTH" | "HANGAR";

export interface AddonProject {
  source: AddonSource;
  id: string;
  slug: string;
  name: string;
  description: string;
  author: string;
  iconUrl: string | null;
  downloads: number;
  updatedAt: string | null;
  url: string;
  categories: string[];
}

export interface AddonVersion {
  source: AddonSource;
  id: string;
  name: string;
  versionNumber: string;
  gameVersions: string[];
  loaders: string[];
  publishedAt: string;
  file: { url: string | null; fileName: string; size: number; sha512?: string; sha256?: string } | null;
  external: boolean;
}

async function get<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(15_000), next: { revalidate: 120 } } as RequestInit);
  } catch {
    throw new ApiError(502, "Could not reach the plugin repository");
  }
  if (res.status === 404) throw new ApiError(404, "Project not found");
  if (!res.ok) throw new ApiError(502, `Plugin repository responded with ${res.status}`);
  return (await res.json()) as T;
}

export function sourcesFor(software: SoftwareId): AddonSource[] {
  const def = SOFTWARE[software];
  const sources: AddonSource[] = [];
  if (def.modrinthLoaders.length) sources.push("MODRINTH");
  if (def.hangarPlatform) sources.push("HANGAR");
  return sources;
}

function isConcreteVersion(v?: string | null): v is string {
  return !!v && /^\d+(\.\d+){1,2}$/.test(v);
}

interface ModrinthHit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  icon_url: string | null;
  downloads: number;
  date_modified: string;
  project_type: string;
  categories: string[];
}

interface HangarProject {
  id: number;
  name: string;
  namespace: { owner: string; slug: string };
  stats: { downloads: number };
  description: string;
  avatarUrl?: string;
  lastUpdated: string;
  category: string;
}

export async function searchAddons(opts: {
  source: AddonSource;
  software: SoftwareId;
  query: string;
  gameVersion?: string;
  offset?: number;
  limit?: number;
}): Promise<{ hits: AddonProject[]; total: number }> {
  const def = SOFTWARE[opts.software];
  const limit = Math.min(opts.limit ?? 20, 50);
  if (opts.source === "MODRINTH") {
    if (!def.modrinthLoaders.length) return { hits: [], total: 0 };
    const facets: string[][] = [
      [`project_type:${def.addonKind === "mod" ? "mod" : "plugin"}`],
      def.modrinthLoaders.map((l) => `categories:${l}`),
    ];
    if (def.addonKind === "mod") facets.push(["server_side:required", "server_side:optional"]);
    if (isConcreteVersion(opts.gameVersion)) facets.push([`versions:${opts.gameVersion}`]);
    const params = new URLSearchParams({
      query: opts.query,
      limit: String(limit),
      offset: String(opts.offset ?? 0),
      index: opts.query ? "relevance" : "downloads",
      facets: JSON.stringify(facets),
    });
    const data = await get<{ hits: ModrinthHit[]; total_hits: number }>(`${MODRINTH}/search?${params}`);
    return {
      total: data.total_hits,
      hits: data.hits.map((h) => ({
        source: "MODRINTH",
        id: h.project_id,
        slug: h.slug,
        name: h.title,
        description: h.description,
        author: h.author,
        iconUrl: h.icon_url || null,
        downloads: h.downloads,
        updatedAt: h.date_modified,
        url: `https://modrinth.com/${h.project_type}/${h.slug}`,
        categories: h.categories,
      })),
    };
  }
  if (!def.hangarPlatform) return { hits: [], total: 0 };
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(opts.offset ?? 0),
    platform: def.hangarPlatform,
  });
  if (opts.query) params.set("query", opts.query);
  const data = await get<{ pagination: { count: number }; result: HangarProject[] }>(`${HANGAR}/projects?${params}`);
  return {
    total: data.pagination.count,
    hits: data.result.map((p) => ({
      source: "HANGAR",
      id: p.namespace.slug,
      slug: p.namespace.slug,
      name: p.name,
      description: p.description,
      author: p.namespace.owner,
      iconUrl: p.avatarUrl ?? null,
      downloads: p.stats.downloads,
      updatedAt: p.lastUpdated,
      url: `https://hangar.papermc.io/${p.namespace.owner}/${p.namespace.slug}`,
      categories: [p.category],
    })),
  };
}

interface ModrinthVersion {
  id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  date_published: string;
  files: { url: string; filename: string; primary: boolean; size: number; hashes: { sha512?: string } }[];
}

interface HangarVersion {
  id: number;
  name: string;
  createdAt: string;
  downloads: Record<string, { fileInfo?: { name: string; sizeBytes: number; sha256Hash: string } | null; externalUrl?: string | null; downloadUrl?: string | null }>;
  platformDependencies: Record<string, string[]>;
}

function hangarSupports(versions: string[], gameVersion?: string) {
  if (!isConcreteVersion(gameVersion)) return true;
  const minor = gameVersion.split(".").slice(0, 2).join(".");
  return versions.some((v) => v === gameVersion || v === minor || (v.includes("-") && rangeIncludes(v, gameVersion)));
}

function rangeIncludes(range: string, version: string) {
  const [from, to] = range.split("-").map((s) => s.trim());
  if (!from || !to) return false;
  const cmp = (a: string, b: string) => {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
    return 0;
  };
  return cmp(version, from) >= 0 && cmp(version, to.includes(".") && to.split(".").length === 2 ? `${to}.99` : to) <= 0;
}

export async function listVersions(opts: {
  source: AddonSource;
  projectId: string;
  software: SoftwareId;
  gameVersion?: string;
  compatibleOnly?: boolean;
}): Promise<AddonVersion[]> {
  const def = SOFTWARE[opts.software];
  if (!/^[A-Za-z0-9_.-]{1,80}$/.test(opts.projectId)) throw new ApiError(422, "Invalid project id");
  if (opts.source === "MODRINTH") {
    const params = new URLSearchParams({ loaders: JSON.stringify(def.modrinthLoaders) });
    if (opts.compatibleOnly !== false && isConcreteVersion(opts.gameVersion)) params.set("game_versions", JSON.stringify([opts.gameVersion]));
    const versions = await get<ModrinthVersion[]>(`${MODRINTH}/project/${encodeURIComponent(opts.projectId)}/version?${params}`);
    return versions.map((v) => {
      const file = v.files.find((f) => f.primary) ?? v.files[0];
      return {
        source: "MODRINTH",
        id: v.id,
        name: v.name,
        versionNumber: v.version_number,
        gameVersions: v.game_versions,
        loaders: v.loaders,
        publishedAt: v.date_published,
        file: file ? { url: file.url, fileName: file.filename, size: file.size, sha512: file.hashes.sha512 } : null,
        external: false,
      };
    });
  }
  const platform = def.hangarPlatform;
  if (!platform) return [];
  const data = await get<{ result: HangarVersion[] }>(
    `${HANGAR}/projects/${encodeURIComponent(opts.projectId)}/versions?limit=25&offset=0&platform=${platform}`,
  );
  return data.result
    .filter((v) => opts.compatibleOnly === false || hangarSupports(v.platformDependencies[platform] ?? [], opts.gameVersion))
    .map((v) => {
      const dl = v.downloads[platform];
      const url = dl?.downloadUrl ?? null;
      return {
        source: "HANGAR",
        id: String(v.id),
        name: v.name,
        versionNumber: v.name,
        gameVersions: v.platformDependencies[platform] ?? [],
        loaders: [platform.toLowerCase()],
        publishedAt: v.createdAt,
        file: dl?.fileInfo
          ? { url, fileName: dl.fileInfo.name, size: dl.fileInfo.sizeBytes, sha256: dl.fileInfo.sha256Hash?.toLowerCase() }
          : null,
        external: !url,
      };
    });
}

export function assertDownloadAllowed(url: string) {
  const host = new URL(url).hostname;
  if (!(ALLOWED_DOWNLOAD_HOSTS as readonly string[]).includes(host)) throw new ApiError(422, `Downloads from ${host} are not allowed`);
}

export function safeJarName(name: string) {
  const cleaned = name.replace(/[^A-Za-z0-9 ._+()\[\]-]/g, "_").slice(0, 200);
  return cleaned.toLowerCase().endsWith(".jar") ? cleaned : `${cleaned}.jar`;
}
