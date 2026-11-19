import { z } from "zod";
import { SOFTWARE } from "@loadstone/shared";
import { db } from "@/lib/db";
import { ApiError, handler } from "@/lib/api";
import { serverWithAgent } from "@/lib/access";
import { safeJarName } from "@/lib/addons";
import { logActivity } from "@/lib/activity";

type Params = { id: string };

export const POST = handler<Params>(async ({ req, user, params, ip }) => {
  const { server, agent, base } = await serverWithAgent(user, params.id);
  const dir = SOFTWARE[server.software].addonDirectory;
  if (!dir) throw new ApiError(409, "This server software does not support plugins or mods");
  const raw = z.string().min(1).max(200).parse(req.nextUrl.searchParams.get("file"));
  if (!raw.toLowerCase().endsWith(".jar")) throw new ApiError(422, "Only .jar files can be uploaded");
  const fileName = safeJarName(raw);
  if (!req.body) throw new ApiError(400, "Empty upload");
  await agent.request(`${base}/files/upload`, {
    method: "POST",
    query: { path: `/${dir}/${fileName}` },
    body: req.body,
    headers: { "content-type": "application/octet-stream" },
    timeoutMs: 15 * 60_000,
  });
  await db.installedPlugin.upsert({
    where: { serverId_directory_fileName: { serverId: server.id, directory: dir, fileName } },
    create: { serverId: server.id, source: "UPLOAD", name: fileName.replace(/\.jar$/i, ""), fileName, directory: dir },
    update: { source: "UPLOAD", projectId: null, versionId: null, versionName: null },
  });
  await logActivity({ action: "plugins.upload", message: `Uploaded ${fileName} to ${server.name}`, userId: user.id, serverId: server.id, ip });
  return { ok: true, fileName };
});
