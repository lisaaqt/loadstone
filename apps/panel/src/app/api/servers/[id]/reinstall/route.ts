import { db } from "@/lib/db";
import { ApiError, handler } from "@/lib/api";
import { canManageServer, isLocked, serverWithAgent } from "@/lib/access";
import { enqueue } from "@/lib/queue";
import { logActivity } from "@/lib/activity";

type Params = { id: string };

/** Wipes the container and every server file (backups are kept) and installs the server again from scratch. */
export const POST = handler<Params>(
  async ({ user, params, ip }) => {
    const { server, agent, base } = await serverWithAgent(user, params.id);
    if (!canManageServer(user, server)) throw new ApiError(403, "Only the owner or an administrator can reinstall this server");
    if (isLocked(server.state)) throw new ApiError(409, "The server is busy, try again when it is unlocked");
    const busy = await db.backup.count({ where: { serverId: server.id, status: { in: ["PENDING", "RUNNING", "RESTORING"] } } });
    if (busy > 0) throw new ApiError(409, "Wait for the running backup operation to finish");

    await db.server.update({ where: { id: server.id }, data: { state: "INSTALLING", installError: null, containerId: null, stateChangedAt: new Date() } });
    try {
      await agent.request(`${base}/wipe`, { method: "POST", timeoutMs: 120_000 });
    } catch (err) {
      await db.server.update({ where: { id: server.id }, data: { state: "ERROR", installError: "Reinstall failed: could not wipe the server files", stateChangedAt: new Date() } });
      throw err;
    }
    await db.installedPlugin.deleteMany({ where: { serverId: server.id } });
    await enqueue("server.install", { serverId: server.id, start: true }, { jobId: `install-${server.id}-${Date.now()}` });
    await logActivity({ action: "server.reinstall", message: `Reinstalling ${server.name} from scratch`, userId: user.id, serverId: server.id, ip });
    return Response.json({ ok: true }, { status: 202 });
  },
  { rateLimit: { limit: 5, windowSeconds: 300, bucket: "server-reinstall" } },
);
