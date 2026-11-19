import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, parseBody } from "@/lib/api";
import { getServerForUser, serverScope, serverWithAgent } from "@/lib/access";
import { agentFor } from "@/lib/agent-client";
import { logActivity } from "@/lib/activity";
import {
  configureBackend,
  forwardingSecret,
  LEGACY_FORWARDING,
  MODERN_FORWARDING,
  parseVelocity,
  readFile,
  renderVelocity,
  writeFile,
  type ForwardingMode,
} from "@/lib/velocity";
import { parseBungee, renderBungee } from "@/lib/bungee";
import { isProxySoftware, PROXY_IDS } from "@loadstone/shared";

type Params = { id: string };

/** Where each proxy type keeps its server list, and how to apply changes without a restart (if possible). */
const BUNGEE = { file: "/config.yml", parse: parseBungee, render: renderBungee, reload: null, modern: false } as const;
const ADAPTERS = {
  VELOCITY: { file: "/velocity.toml", parse: parseVelocity, render: renderVelocity, reload: "velocity reload", modern: true },
  BUNGEECORD: BUNGEE,
  WATERFALL: BUNGEE,
} as const;

async function loadProxy(user: Parameters<typeof serverWithAgent>[0], id: string) {
  const ctx = await serverWithAgent(user, id);
  if (!isProxySoftware(ctx.server.software)) throw new ApiError(400, "Only proxy servers have a network configuration");
  return { ...ctx, adapter: ADAPTERS[ctx.server.software] };
}

/** Address a proxy uses for a backend: the container name on the same node, otherwise the public address. */
const addressFor = (proxyNodeId: string, s: { id: string; nodeId: string; port: number; internalPort: number; node: { publicHost: string } }) =>
  s.nodeId === proxyNodeId ? `loadstone-${s.id}:${s.internalPort}` : `${s.node.publicHost}:${s.port}`;

async function candidates(user: Parameters<typeof serverWithAgent>[0], proxyId: string) {
  return db.server.findMany({
    where: { ...serverScope(user), id: { not: proxyId }, software: { notIn: [...PROXY_IDS] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, software: true, state: true, nodeId: true, port: true, internalPort: true, env: true, node: { select: { name: true, publicHost: true } } },
  });
}

export const GET = handler<Params>(async ({ user, params }) => {
  const { server, agent, adapter } = await loadProxy(user, params.id);
  const text = await readFile(agent, server.id, adapter.file);
  const servers = await candidates(user, server.id);
  const list = servers.map((s) => ({
    id: s.id,
    name: s.name,
    software: s.software,
    state: s.state,
    nodeName: s.node.name,
    address: addressFor(server.nodeId, s),
    forwarding: { modern: (MODERN_FORWARDING as readonly string[]).includes(s.software), legacy: (LEGACY_FORWARDING as readonly string[]).includes(s.software) },
  }));
  if (text === null) return { ready: false, configFile: adapter.file.slice(1), candidates: list };
  const cfg = adapter.parse(text);
  const entries = Object.entries(cfg.servers).map(([name, address]) => ({
    name,
    address,
    serverId: list.find((c) => c.address === address)?.id ?? null,
    fallback: cfg.try.includes(name),
    forcedHosts: Object.entries(cfg.forcedHosts)
      .filter(([, names]) => names.includes(name))
      .map(([host]) => host),
  }));
  // Fallbacks first, in the proxy's try order, then the rest.
  entries.sort((a, b) => (a.fallback === b.fallback ? cfg.try.indexOf(a.name) - cfg.try.indexOf(b.name) : a.fallback ? -1 : 1));
  return { ready: true, configFile: adapter.file.slice(1), supportsModern: adapter.modern, forwardingMode: cfg.forwardingMode, entries, candidates: list };
});

const entrySchema = z.object({
  name: z.string().regex(/^[a-z0-9_-]{1,32}$/, "Names may only use lowercase letters, digits, - and _"),
  serverId: z.string().nullable().optional(),
  address: z.string().trim().max(255).optional(),
  fallback: z.boolean().default(false),
  forcedHosts: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9.-]{1,253}$/, "Invalid forced host")).max(20).default([]),
});

export const PUT = handler<Params>(async ({ req, user, params, ip }) => {
  const { server: proxy, agent, adapter } = await loadProxy(user, params.id);
  const input = await parseBody(req, z.object({ forwardingMode: z.enum(["modern", "legacy", "none"]), entries: z.array(entrySchema).max(100) }));
  const names = new Set<string>();
  for (const e of input.entries) {
    if (names.has(e.name)) throw new ApiError(422, `The name "${e.name}" is used twice`);
    names.add(e.name);
  }

  const text = await readFile(agent, proxy.id, adapter.file);
  if (text === null) throw new ApiError(409, `Start the proxy once so it creates ${adapter.file.slice(1)}, then try again`);
  const before = adapter.parse(text);
  const mode = input.forwardingMode as ForwardingMode;

  const all = await candidates(user, proxy.id);
  const servers: Record<string, string> = {};
  const linked: typeof all = [];
  for (const e of input.entries) {
    if (e.serverId) {
      const backend = all.find((s) => s.id === e.serverId);
      if (!backend) throw new ApiError(404, "One of the selected servers was not found");
      if (backend.nodeId === proxy.nodeId) {
        // Both containers must share the node's server network for name-based addressing.
        await agent.request(`/api/servers/${proxy.id}/network`, { method: "POST" }).catch(() => undefined);
        await agent.request(`/api/servers/${backend.id}/network`, { method: "POST" }).catch((err: unknown) => {
          throw new ApiError(409, `${backend.name} has no container yet. Wait until it is installed. (${err instanceof Error ? err.message : String(err)})`);
        });
      }
      servers[e.name] = addressFor(proxy.nodeId, backend);
      linked.push(backend);
    } else {
      if (!e.address || !/^[A-Za-z0-9.-]+:\d{1,5}$/.test(e.address)) throw new ApiError(422, `Enter an address like host:25565 for "${e.name}"`);
      servers[e.name] = e.address;
    }
  }
  const forcedHosts: Record<string, string[]> = {};
  for (const e of input.entries) for (const host of e.forcedHosts) forcedHosts[host] = [...(forcedHosts[host] ?? []), e.name];

  const next = { servers, try: input.entries.filter((e) => e.fallback).map((e) => e.name), forcedHosts, forwardingMode: mode };
  await writeFile(agent, proxy.id, adapter.file, adapter.render(text, next));
  const secret = mode === "modern" ? await forwardingSecret(agent, proxy.id, text) : "";

  // Point linked backends at the proxy; undo it for Loadstone servers that were removed from the proxy.
  const previouslyLinked = all.filter((s) => Object.values(before.servers).includes(addressFor(proxy.nodeId, s)) && !linked.some((l) => l.id === s.id));
  const warnings: string[] = [];
  const restart: { id: string; name: string }[] = [];
  for (const [backend, enabled] of [...linked.map((s) => [s, true] as const), ...previouslyLinked.map((s) => [s, false] as const)]) {
    const fullBackend = await getServerForUser(user, backend.id);
    const backendAgent = agentFor(fullBackend.node);
    if (enabled && mode !== "none" && !(mode === "modern" ? MODERN_FORWARDING : LEGACY_FORWARDING).some((s) => s === backend.software)) {
      warnings.push(`${backend.name} (${backend.software}) needs a proxy mod such as FabricProxy-Lite / Proxy-Compatible-Forge for ${mode} forwarding`);
    }
    await configureBackend(backendAgent, backend.id, backend.software, mode, secret, enabled).catch((err: unknown) => {
      warnings.push(`Could not update ${backend.name}'s config: ${err instanceof Error ? err.message : String(err)}`);
    });
    const env = { ...((backend.env as Record<string, string>) ?? {}) };
    const wanted = enabled && mode !== "none" ? "FALSE" : undefined;
    if (env.ONLINE_MODE !== wanted) {
      if (wanted) env.ONLINE_MODE = wanted;
      else delete env.ONLINE_MODE;
      await db.server.update({ where: { id: backend.id }, data: { env } });
    }
    if (backend.state === "RUNNING") restart.push({ id: backend.id, name: backend.name });
  }

  let reloaded = false;
  if (proxy.state === "RUNNING" && adapter.reload) {
    reloaded = await agent
      .request(`/api/servers/${proxy.id}/command`, { method: "POST", json: { command: adapter.reload } })
      .then(() => true)
      .catch(() => false);
  }
  await logActivity({ action: "proxy.network.update", message: `Updated the network of ${proxy.name} (${input.entries.length} servers)`, userId: user.id, serverId: proxy.id, ip });
  return { ok: true, reloaded, restart, warnings };
});
