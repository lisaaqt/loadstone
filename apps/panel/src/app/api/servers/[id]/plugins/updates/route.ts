import { db } from "@/lib/db";
import { handler } from "@/lib/api";
import { getServerForUser } from "@/lib/access";
import { listVersions } from "@/lib/addons";

type Params = { id: string };

export const GET = handler<Params>(async ({ user, params }) => {
  const server = await getServerForUser(user, params.id);
  const records = await db.installedPlugin.findMany({ where: { serverId: server.id, source: { in: ["MODRINTH", "HANGAR"] } } });
  const results = await Promise.all(
    records.map(async (r) => {
      try {
        const versions = await listVersions({
          source: r.source as "MODRINTH" | "HANGAR",
          projectId: r.projectId!,
          software: server.software,
          gameVersion: server.mcVersion,
        });
        const latest = versions.find((v) => v.file?.url);
        return {
          fileName: r.fileName,
          currentVersion: r.versionName,
          compatible: versions.length > 0,
          latest: latest && latest.id !== r.versionId ? { id: latest.id, versionNumber: latest.versionNumber } : null,
        };
      } catch {
        return { fileName: r.fileName, currentVersion: r.versionName, compatible: null, latest: null };
      }
    }),
  );
  return { updates: results };
});
