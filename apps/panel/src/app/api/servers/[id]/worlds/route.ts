import { z } from "zod";
import type { WorldInfo } from "@loadstone/shared";
import { ApiError, handler, parseBody } from "@/lib/api";
import { serverWithAgent } from "@/lib/access";
import { logActivity } from "@/lib/activity";
import { streamResponse } from "@/lib/proxy";

type Params = { id: string };

const worldNameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_\-. ]{1,64}$/, "World names may only contain letters, numbers, spaces, dots, dashes and underscores")
  .refine((n) => n !== "." && n !== "..", "Invalid world name");

export const GET = handler<Params>(async ({ req, user, params }) => {
  const { server, agent, base } = await serverWithAgent(user, params.id);
  const exportName = req.nextUrl.searchParams.get("export");
  if (exportName) {
    const name = worldNameSchema.parse(exportName);
    const upstream = await agent.raw(`${base}/worlds/export`, { query: { name }, timeoutMs: 30 * 60_000 });
    return streamResponse(upstream, `${server.name}-${name}.zip`.replace(/\s+/g, "-"), "application/zip");
  }
  return agent.request<{ worlds: WorldInfo[]; active: string }>(`${base}/worlds`);
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("activate"), name: worldNameSchema }),
  z.object({ action: z.literal("delete"), name: worldNameSchema }),
]);

export const POST = handler<Params>(async ({ req, user, params, ip }) => {
  const { server, agent, base } = await serverWithAgent(user, params.id);

  const importName = req.nextUrl.searchParams.get("import");
  if (importName) {
    const name = worldNameSchema.parse(importName);
    if (!req.body) throw new ApiError(400, "Empty upload");
    await agent.request(`${base}/worlds/import`, {
      method: "POST",
      query: { name },
      body: req.body,
      headers: { "content-type": "application/octet-stream" },
      timeoutMs: 60 * 60_000,
    });
    await logActivity({ action: "worlds.import", message: `Imported world ${name} into ${server.name}`, userId: user.id, serverId: server.id, ip });
    return { ok: true };
  }

  const input = await parseBody(req, actionSchema);
  if (input.action === "delete" && server.state !== "OFFLINE") throw new ApiError(409, "Stop the server before deleting a world");
  await agent.request(`${base}/worlds/${input.action}`, { method: "POST", json: { name: input.name }, timeoutMs: 120_000 });
  await logActivity({
    action: `worlds.${input.action}`,
    message: input.action === "activate" ? `Set ${input.name} as the active world on ${server.name}` : `Deleted world ${input.name} from ${server.name}`,
    userId: user.id,
    serverId: server.id,
    ip,
  });
  return { ok: true };
});
