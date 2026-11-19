import { z } from "zod";
import { SOFTWARE, type FileEntry } from "@loadstone/shared";
import { db } from "@/lib/db";
import { ApiError, handler, parseBody } from "@/lib/api";
import { serverWithAgent } from "@/lib/access";
import { assertDownloadAllowed, listVersions, safeJarName } from "@/lib/addons";
import { logActivity } from "@/lib/activity";

type Params = { id: string };

function addonDir(software: keyof typeof SOFTWARE) {
  const dir = SOFTWARE[software].addonDirectory;
  if (!dir) throw new ApiError(409, "This server software does not support plugins or mods");
  return dir;
}

export const GET = handler<Params>(async ({ user, params }) => {
  const { server, agent, base } = await serverWithAgent(user, params.id);
  const dir = SOFTWARE[server.software].addonDirectory;
  if (!dir) return { directory: null, installed: [] };
  let entries: FileEntry[] = [];
  try {
    entries = (await agent.request<{ entries: FileEntry[] }>(`${base}/files/list`, { query: { path: `/${dir}` } })).entries;
  } catch (err) {
    if (!(err instanceof Error && /not found|ENOENT/i.test(err.message))) throw err;
  }
  const records = await db.installedPlugin.findMany({ where: { serverId: server.id, directory: dir } });
  const byFile = new Map(records.map((r) => [r.fileName, r]));
  const jars = entries.filter((e) => e.type === "file" && /\.jar(\.disabled)?$/i.test(e.name));
  const present = new Set(jars.map((j) => j.name.replace(/\.disabled$/, "")));
  const stale = records.filter((r) => !present.has(r.fileName));
  if (stale.length) await db.installedPlugin.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  return {
    directory: dir,
    installed: jars.map((j) => {
      const fileName = j.name.replace(/\.disabled$/, "");
      const record = byFile.get(fileName);
      return {
        fileName,
        enabled: !j.name.endsWith(".disabled"),
        size: j.size,
        modifiedAt: j.modifiedAt,
        source: record?.source ?? "UPLOAD",
        name: record?.name ?? fileName.replace(/\.jar$/i, ""),
        projectId: record?.projectId ?? null,
        versionId: record?.versionId ?? null,
        versionName: record?.versionName ?? null,
        iconUrl: record?.iconUrl ?? null,
      };
    }),
  };
});

const installSchema = z.object({
  source: z.enum(["MODRINTH", "HANGAR"]),
  projectId: z.string().min(1).max(80),
  versionId: z.string().min(1).max(80),
  name: z.string().max(120),
  iconUrl: z.string().url().max(500).nullable().optional(),
  replaces: z.string().max(200).optional(),
});

export const POST = handler<Params>(async ({ req, user, params, ip }) => {
  const { server, agent, base } = await serverWithAgent(user, params.id);
  const dir = addonDir(server.software);
  const input = await parseBody(req, installSchema);

  const versions = await listVersions({ source: input.source, projectId: input.projectId, software: server.software, compatibleOnly: false });
  const version = versions.find((v) => v.id === input.versionId);
  if (!version?.file?.url) throw new ApiError(422, "This version cannot be installed automatically (external download)");
  assertDownloadAllowed(version.file.url);
  const fileName = safeJarName(version.file.fileName);

  await agent.request(`${base}/plugins/install`, {
    method: "POST",
    json: {
      url: version.file.url,
      directory: dir,
      fileName,
      sha512: version.file.sha512,
      sha256: version.file.sha256,
      replaces: input.replaces && input.replaces !== fileName ? safeJarName(input.replaces) : undefined,
    },
    timeoutMs: 5 * 60_000,
  });

  if (input.replaces) await db.installedPlugin.deleteMany({ where: { serverId: server.id, directory: dir, fileName: input.replaces } });
  await db.installedPlugin.upsert({
    where: { serverId_directory_fileName: { serverId: server.id, directory: dir, fileName } },
    create: {
      serverId: server.id,
      source: input.source,
      projectId: input.projectId,
      projectSlug: input.projectId,
      name: input.name,
      versionId: version.id,
      versionName: version.versionNumber,
      fileName,
      directory: dir,
      iconUrl: input.iconUrl ?? null,
    },
    update: { versionId: version.id, versionName: version.versionNumber, name: input.name, iconUrl: input.iconUrl ?? null },
  });
  await logActivity({
    action: input.replaces ? "plugins.update" : "plugins.install",
    message: `${input.replaces ? "Updated" : "Installed"} ${input.name} ${version.versionNumber} on ${server.name}`,
    userId: user.id,
    serverId: server.id,
    ip,
  });
  return { ok: true, fileName };
});

const deleteSchema = z.object({ fileName: z.string().regex(/^[A-Za-z0-9 ._+()\[\]-]{1,200}\.jar$/) });

export const DELETE = handler<Params>(async ({ req, user, params, ip }) => {
  const { server, agent, base } = await serverWithAgent(user, params.id);
  const dir = addonDir(server.software);
  const { fileName } = deleteSchema.parse({ fileName: req.nextUrl.searchParams.get("file") });
  await agent.request(`${base}/files/delete`, { method: "POST", json: { paths: [`/${dir}/${fileName}`, `/${dir}/${fileName}.disabled`] } });
  await db.installedPlugin.deleteMany({ where: { serverId: server.id, directory: dir, fileName } });
  await logActivity({ action: "plugins.remove", message: `Removed ${fileName} from ${server.name}`, userId: user.id, serverId: server.id, ip });
});

const toggleSchema = z.object({ fileName: deleteSchema.shape.fileName, enabled: z.boolean() });

export const PATCH = handler<Params>(async ({ req, user, params, ip }) => {
  const { server, agent, base } = await serverWithAgent(user, params.id);
  const dir = addonDir(server.software);
  const { fileName, enabled } = await parseBody(req, toggleSchema);
  const on = `/${dir}/${fileName}`;
  const off = `${on}.disabled`;
  await agent.request(`${base}/files/rename`, { method: "POST", json: enabled ? { from: off, to: on } : { from: on, to: off } });
  await logActivity({ action: "plugins.toggle", message: `${enabled ? "Enabled" : "Disabled"} ${fileName} on ${server.name}`, userId: user.id, serverId: server.id, ip });
  return { ok: true };
});
