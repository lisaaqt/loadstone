import { z } from "zod";
import type { FileEntry } from "@loadstone/shared";
import { ApiError, handler, parseBody } from "@/lib/api";
import { serverWithAgent } from "@/lib/access";
import { streamResponse } from "@/lib/proxy";
import { logActivity } from "@/lib/activity";

type Params = { id: string; action: string };

const pathSchema = z
  .string()
  .max(1024)
  .refine((p) => !p.includes("\0"), "Invalid path")
  .transform((p) => p.replace(/\\/g, "/"));

const MAX_EDIT_BYTES = 5 * 1024 * 1024;

export const GET = handler<Params>(async ({ req, user, params }) => {
  const { agent, base } = await serverWithAgent(user, params.id);
  const path = pathSchema.parse(req.nextUrl.searchParams.get("path") ?? "/");
  switch (params.action) {
    case "list":
      return agent.request<{ entries: FileEntry[] }>(`${base}/files/list`, { query: { path } });
    case "content":
      return agent.request<{ content: string; size: number }>(`${base}/files/content`, { query: { path } });
    case "download": {
      const upstream = await agent.raw(`${base}/files/download`, { query: { path }, timeoutMs: 10 * 60_000 });
      const name = upstream.headers.get("x-file-name") ?? path.split("/").pop() ?? "download";
      return streamResponse(upstream, name);
    }
    default:
      throw new ApiError(404, "Unknown file action");
  }
});

const schemas = {
  write: z.object({ path: pathSchema, content: z.string().max(MAX_EDIT_BYTES) }),
  mkdir: z.object({ path: pathSchema }),
  rename: z.object({ from: pathSchema, to: pathSchema }),
  delete: z.object({ paths: z.array(pathSchema).min(1).max(500) }),
  extract: z.object({ path: pathSchema, destination: pathSchema.optional() }),
  compress: z.object({ paths: z.array(pathSchema).min(1).max(500), destination: pathSchema }),
} as const;

export const POST = handler<Params>(async ({ req, user, params, ip }) => {
  const { server, agent, base } = await serverWithAgent(user, params.id);
  const action = params.action;

  if (action === "upload") {
    const path = pathSchema.parse(req.nextUrl.searchParams.get("path"));
    if (!req.body) throw new ApiError(400, "Empty upload");
    await agent.request(`${base}/files/upload`, {
      method: "POST",
      query: { path },
      body: req.body,
      headers: { "content-type": "application/octet-stream" },
      timeoutMs: 60 * 60_000,
    });
    await logActivity({ action: "files.upload", message: `Uploaded ${path} to ${server.name}`, userId: user.id, serverId: server.id, ip });
    return { ok: true };
  }

  if (!(action in schemas)) throw new ApiError(404, "Unknown file action");
  const body = (await parseBody(req, schemas[action as keyof typeof schemas] as z.ZodType)) as
    | { path: string }
    | { paths: string[] }
    | { from: string; to: string };
  const result = await agent.request(`${base}/files/${action}`, {
    method: "POST",
    json: body,
    timeoutMs: action === "extract" || action === "compress" ? 30 * 60_000 : 60_000,
  });
  const target = "paths" in body ? `${body.paths.length} item(s)` : "path" in body ? body.path : `${body.from} → ${body.to}`;
  await logActivity({ action: `files.${action}`, message: `${action} ${target} on ${server.name}`, userId: user.id, serverId: server.id, ip });
  return result ?? { ok: true };
});
