import { db } from "@/lib/db";
import { ApiError, handler, parseBody } from "@/lib/api";
import { serverScope } from "@/lib/access";
import { enqueue } from "@/lib/queue";
import { logActivity } from "@/lib/activity";
import { getGeneralSettings } from "@/lib/settings";
import { allocatePort, assertCapacity, createServerSchema, pickNode, resolveImage, serverQuota, softwareDefaults } from "@/lib/servers";

export const GET = handler(async ({ req, user }) => {
  const where = serverScope(user);
  if (req.nextUrl.searchParams.get("view") === "sidebar") {
    const servers = await db.server.findMany({ where, select: { id: true, name: true, state: true, software: true }, orderBy: { name: "asc" }, take: 30 });
    return { servers };
  }
  const servers = await db.server.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { node: { select: { id: true, name: true, publicHost: true, status: true } }, owner: { select: { id: true, name: true } } },
  });
  return { servers };
});

export const POST = handler(
  async ({ req, user, ip }) => {
    const input = await parseBody(req, createServerSchema);
    if (user.role !== "ADMIN") {
      const quota = await serverQuota(user);
      if (!quota.canCreate) {
        throw new ApiError(403, quota.limit ? `You can create up to ${quota.limit} server${quota.limit === 1 ? "" : "s"}` : "Only administrators can create servers");
      }
      const caps = quota.caps!;
      if (input.memoryMb > caps.memoryMb) throw new ApiError(422, `Memory is limited to ${caps.memoryMb} MB per server`);
      if (input.diskMb > caps.diskMb) throw new ApiError(422, `Storage is limited to ${caps.diskMb} MB per server`);
      if (caps.cpuPercent > 0 && (input.cpuPercent === 0 || input.cpuPercent > caps.cpuPercent)) {
        throw new ApiError(422, `CPU is limited to ${caps.cpuPercent / 100} cores per server`);
      }
      if (input.software === "CUSTOM") throw new ApiError(403, "Only administrators can create custom image servers");
      input.ownerId = user.id;
      input.nodeId = undefined;
      input.port = undefined;
    }

    const ownerId = input.ownerId ?? user.id;
    if (!(await db.user.findUnique({ where: { id: ownerId } }))) throw new ApiError(422, "Owner not found");

    const nodeId = input.nodeId ?? (await pickNode(input.memoryMb, input.diskMb));
    await assertCapacity(nodeId, input.memoryMb, input.diskMb);
    const port = await allocatePort(nodeId, input.port);
    const defaults = softwareDefaults(input.software);

    const server = await db.server.create({
      data: {
        name: input.name,
        description: input.description,
        ownerId,
        nodeId,
        software: input.software,
        mcVersion: input.mcVersion,
        javaVersion: input.javaVersion,
        image: resolveImage(input.software, input.javaVersion, input.customImage),
        memoryMb: input.memoryMb,
        cpuPercent: input.cpuPercent,
        diskMb: input.diskMb,
        port,
        internalPort: input.internalPort ?? defaults.internalPort,
        dataPath: input.dataPath ?? defaults.dataPath,
        env: input.env,
        jvmArgs: input.jvmArgs,
        startupCommand: input.software === "CUSTOM" ? input.startupCommand || null : null,
        backupRetention: (await getGeneralSettings()).defaultBackupRetention,
        state: "INSTALLING",
      },
    });

    await enqueue("server.install", { serverId: server.id, start: input.startOnCreate }, { jobId: `install-${server.id}` });
    await logActivity({
      action: "server.create",
      message: `Created server ${server.name}`,
      userId: user.id,
      serverId: server.id,
      nodeId,
      ip,
    });
    return Response.json({ server: { id: server.id } }, { status: 201 });
  },
  { rateLimit: { limit: 20, windowSeconds: 60, bucket: "server-create" } },
);
