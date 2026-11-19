import { isMap, parseDocument, type YAMLMap } from "yaml";
import { ApiError } from "./api";
import type { VelocityConfig } from "./velocity";

/** BungeeCord / Waterfall config.yml ↔ the proxy model used by the Network tab. Only legacy forwarding exists here. */
function load(text: string) {
  const doc = parseDocument(text);
  if (doc.errors.length) throw new ApiError(422, `config.yml could not be parsed: ${doc.errors[0]!.message}`);
  return doc;
}

export function parseBungee(text: string): VelocityConfig {
  const data = (load(text).toJS() ?? {}) as {
    servers?: Record<string, { address?: string }>;
    listeners?: { priorities?: string[]; forced_hosts?: Record<string, string> }[];
    ip_forward?: boolean;
  };
  const servers: Record<string, string> = {};
  for (const [name, s] of Object.entries(data.servers ?? {})) if (s?.address) servers[name] = String(s.address);
  const listener = data.listeners?.[0] ?? {};
  const forcedHosts: Record<string, string[]> = {};
  for (const [host, name] of Object.entries(listener.forced_hosts ?? {})) forcedHosts[host] = [String(name)];
  return { servers, try: (listener.priorities ?? []).map(String), forcedHosts, forwardingMode: data.ip_forward ? "legacy" : "none" };
}

export function renderBungee(original: string, cfg: VelocityConfig) {
  if (cfg.forwardingMode === "modern") throw new ApiError(422, "BungeeCord and Waterfall only support legacy (BungeeCord) forwarding");
  const doc = load(original);
  const existing = doc.get("servers");
  const servers = doc.createNode({}) as YAMLMap;
  for (const [name, address] of Object.entries(cfg.servers)) {
    const prev = isMap(existing) ? existing.get(name, true) : undefined;
    const entry = isMap(prev) ? prev : (doc.createNode({ motd: `&1${name}`, restricted: false }) as YAMLMap);
    entry.set("address", address);
    servers.set(name, entry);
  }
  doc.set("servers", servers);
  if (!doc.hasIn(["listeners", 0])) doc.set("listeners", doc.createNode([{ host: "0.0.0.0:25577" }]));
  doc.setIn(["listeners", 0, "priorities"], doc.createNode(cfg.try));
  doc.setIn(
    ["listeners", 0, "forced_hosts"],
    doc.createNode(Object.fromEntries(Object.entries(cfg.forcedHosts).flatMap(([host, names]) => (names[0] ? [[host, names[0]]] : [])))),
  );
  doc.set("ip_forward", cfg.forwardingMode === "legacy");
  return doc.toString();
}
