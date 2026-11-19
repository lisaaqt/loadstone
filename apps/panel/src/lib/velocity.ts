import { parse as parseToml } from "smol-toml";
import { parseDocument } from "yaml";
import { randomToken } from "./crypto";
import { AgentError, type AgentClient } from "./agent-client";
import { ApiError } from "./api";

export type ForwardingMode = "modern" | "legacy" | "none";

/** Backends that support each forwarding mode out of the box (others need a proxy mod such as FabricProxy-Lite). */
export const MODERN_FORWARDING = ["PAPER", "PURPUR", "FOLIA"] as const;
export const LEGACY_FORWARDING = ["PAPER", "PURPUR", "FOLIA", "SPIGOT"] as const;

export interface VelocityConfig {
  servers: Record<string, string>;
  try: string[];
  forcedHosts: Record<string, string[]>;
  forwardingMode: ForwardingMode;
}

export async function readFile(agent: AgentClient, serverId: string, path: string): Promise<string | null> {
  try {
    return (await agent.request<{ content: string }>(`/api/servers/${serverId}/files/content?path=${encodeURIComponent(path)}`)).content;
  } catch (err) {
    if (err instanceof AgentError && err.status === 404) return null;
    throw err;
  }
}

export async function writeFile(agent: AgentClient, serverId: string, path: string, content: string) {
  await agent.request(`/api/servers/${serverId}/files/write`, { method: "POST", json: { path, content } });
}

export function parseVelocity(text: string): VelocityConfig {
  let doc: Record<string, unknown>;
  try {
    doc = parseToml(text) as Record<string, unknown>;
  } catch (err) {
    throw new ApiError(422, `velocity.toml could not be parsed: ${err instanceof Error ? err.message : String(err)}`);
  }
  const servers: Record<string, string> = {};
  let tryList: string[] = [];
  for (const [key, value] of Object.entries((doc.servers as Record<string, unknown>) ?? {})) {
    if (key === "try" && Array.isArray(value)) tryList = value.map(String);
    else if (typeof value === "string") servers[key] = value;
  }
  const forcedHosts: Record<string, string[]> = {};
  for (const [host, value] of Object.entries((doc["forced-hosts"] as Record<string, unknown>) ?? {})) {
    if (Array.isArray(value)) forcedHosts[host] = value.map(String);
  }
  const mode = String(doc["player-info-forwarding-mode"] ?? "none").toLowerCase();
  return { servers, try: tryList, forcedHosts, forwardingMode: mode === "modern" || mode === "legacy" ? mode : "none" };
}

const tomlString = (v: string) => JSON.stringify(v);
const tomlKey = (k: string) => (/^[A-Za-z0-9_-]+$/.test(k) ? k : JSON.stringify(k));

/** Replaces one top-level [table] (header to next header) with new lines, or appends it if missing. */
function replaceTable(text: string, table: string, body: string[]) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((l) => l.trim() === `[${table}]`);
  const block = [`[${table}]`, ...body, ""];
  if (start === -1) return `${lines.join("\n").trimEnd()}\n\n${block.join("\n")}`;
  let end = lines.findIndex((l, i) => i > start && /^\s*\[[^\]]+\]\s*$/.test(l));
  if (end === -1) end = lines.length;
  return [...lines.slice(0, start), ...block, ...lines.slice(end)].join("\n");
}

/** Writes servers, fallback order, forced hosts and forwarding mode back into velocity.toml, keeping everything else. */
export function renderVelocity(original: string, cfg: VelocityConfig) {
  let text = replaceTable(original, "servers", [
    "# Managed by Loadstone (Network tab). Format: name = \"host:port\"",
    ...Object.entries(cfg.servers).map(([name, address]) => `${tomlKey(name)} = ${tomlString(address)}`),
    "# Servers players join first, in order; the next one is used if one is down.",
    `try = [${cfg.try.map(tomlString).join(", ")}]`,
  ]);
  text = replaceTable(
    text,
    "forced-hosts",
    Object.entries(cfg.forcedHosts).map(([host, names]) => `${tomlString(host)} = [${names.map(tomlString).join(", ")}]`),
  );
  const modeLine = `player-info-forwarding-mode = ${tomlString(cfg.forwardingMode.toUpperCase())}`;
  text = /^player-info-forwarding-mode\s*=.*$/m.test(text) ? text.replace(/^player-info-forwarding-mode\s*=.*$/m, modeLine) : `${modeLine}\n${text}`;
  return text;
}

/** Reads the proxy's forwarding secret, creating one if Velocity hasn't yet. */
export async function forwardingSecret(agent: AgentClient, proxyId: string, configText: string) {
  const file = /^forwarding-secret-file\s*=\s*"([^"]+)"/m.exec(configText)?.[1] ?? "forwarding.secret";
  const existing = (await readFile(agent, proxyId, `/${file}`))?.trim();
  if (existing) return existing;
  const secret = randomToken(18);
  await writeFile(agent, proxyId, `/${file}`, secret);
  return secret;
}

/** Edits a YAML file in place (comments kept); creates it if the server hasn't generated it yet. */
async function editYaml(agent: AgentClient, serverId: string, path: string, edit: (doc: ReturnType<typeof parseDocument>) => void) {
  const doc = parseDocument((await readFile(agent, serverId, path)) ?? "");
  if (doc.errors.length) throw new ApiError(422, `${path} could not be parsed: ${doc.errors[0]!.message}`);
  if (!doc.contents) doc.contents = doc.createNode({}) as unknown as typeof doc.contents;
  edit(doc);
  await writeFile(agent, serverId, path, doc.toString());
}

/** Configures a Paper/Spigot-family backend to accept players forwarded by the proxy (or reverts it). */
export async function configureBackend(agent: AgentClient, serverId: string, software: string, mode: ForwardingMode, secret: string, enabled: boolean) {
  if ((MODERN_FORWARDING as readonly string[]).includes(software)) {
    await editYaml(agent, serverId, "/config/paper-global.yml", (doc) => {
      doc.setIn(["proxies", "velocity", "enabled"], enabled && mode === "modern");
      doc.setIn(["proxies", "velocity", "online-mode"], true);
      doc.setIn(["proxies", "velocity", "secret"], enabled && mode === "modern" ? secret : "");
    });
  }
  if ((LEGACY_FORWARDING as readonly string[]).includes(software)) {
    await editYaml(agent, serverId, "/spigot.yml", (doc) => doc.setIn(["settings", "bungeecord"], enabled && mode === "legacy"));
  }
}

/** Velocity server names: lowercase letters, digits, dashes and underscores. */
export function slugify(name: string, taken: Set<string>) {
  const base = name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "server";
  let candidate = base;
  for (let i = 2; taken.has(candidate); i++) candidate = `${base}-${i}`;
  return candidate;
}
