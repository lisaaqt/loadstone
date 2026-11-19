import { z } from "zod";
import { handler, parseBody } from "@/lib/api";
import { serverWithAgent } from "@/lib/access";
import { logActivity } from "@/lib/activity";
import { parseProperties, sanitizePropertyValue, updateProperties } from "@/lib/properties";

type Params = { id: string };

async function readProps(agent: Awaited<ReturnType<typeof serverWithAgent>>["agent"], base: string) {
  try {
    const { content } = await agent.request<{ content: string }>(`${base}/files/content`, { query: { path: "/server.properties" } });
    return { exists: true, content };
  } catch {
    return { exists: false, content: "" };
  }
}

export const GET = handler<Params>(async ({ user, params }) => {
  const { agent, base } = await serverWithAgent(user, params.id);
  const { exists, content } = await readProps(agent, base);
  return { exists, properties: parseProperties(content) };
});

const PROTECTED = new Set(["server-port", "enable-rcon", "rcon.password", "rcon.port", "query.port"]);

const schema = z.object({
  properties: z.record(z.string().regex(/^[a-z0-9.\-_]{1,64}$/i), z.string().max(1024)),
});

export const PUT = handler<Params>(async ({ req, user, params, ip }) => {
  const { server, agent, base } = await serverWithAgent(user, params.id);
  const { properties } = await parseBody(req, schema);
  const updates = Object.fromEntries(
    Object.entries(properties)
      .filter(([k]) => !PROTECTED.has(k))
      .map(([k, v]) => [k, sanitizePropertyValue(v)]),
  );
  const { content } = await readProps(agent, base);
  await agent.request(`${base}/files/write`, { method: "POST", json: { path: "/server.properties", content: updateProperties(content, updates) } });
  await logActivity({ action: "server.properties", message: `Updated server.properties of ${server.name}`, userId: user.id, serverId: server.id, metadata: { keys: Object.keys(updates) }, ip });
  return { ok: true, needsRestart: server.state === "RUNNING" };
});
