import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { JAVA_VERSIONS } from "@loadstone/shared";
import { db } from "@/lib/db";
import { ApiError, forbidden, handler, parseBody } from "@/lib/api";
import { getServerForUser } from "@/lib/access";
import { agentFor } from "@/lib/agent-client";
import { removeSchedule } from "@/lib/queue";
import { logActivity } from "@/lib/activity";
import { connectionOf, dropDatabase } from "@/lib/databases";
import { getS3Config } from "@/lib/settings";
import { allocatePort, assertCapacity, envSchema, imageSchema, jvmArgsSchema, mcVersionSchema, resolveImage } from "@/lib/servers";

type Params = { id: string };

export const GET = handler<Params>(async ({ user, params }) => {
  const server = await getServerForUser(user, params.id);
  const { tokenEncrypted: _t, ...node } = server.node;
  return { server: { ...server, node } };
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(48).optional(),
  description: z.string().trim().max(280).nullable().optional(),
  mcVersion: mcVersionSchema.optional(),
  javaVersion: z.enum(JAVA_VERSIONS).optional(),
  jvmArgs: jvmArgsSchema.optional(),
  env: envSchema.optional(),
  memoryMb: z.number().int().min(512).max(262144).optional(),
  cpuPercent: z.number().int().min(0).max(25600).optional(),
  diskMb: z.number().int().min(1024).max(4194304).optional(),
  port: z.number().int().min(1024).max(65535).optional(),
  customImage: imageSchema.optional(),
  startupCommand: z.string().max(4096).nullable().optional(),
  backupRetention: z.number().int().min(1).max(500).optional(),
  databaseLimit: z.number().int().min(0).max(100).optional(),
  ownerId: z.string().optional(),
});

const ADMIN_FIELDS = ["memoryMb", "cpuPercent", "diskMb", "port", "customImage", "startupCommand", "ownerId", "databaseLimit"] as const;

export const PATCH = handler<Params>(async ({ req, user, params, ip }) => {
  const server = await getServerForUser(user, params.id);
  const input = await parseBody(req, updateSchema);
  if (user.role !== "ADMIN" && ADMIN_FIELDS.some((f) => input[f] !== undefined)) throw forbidden();

  const data: Prisma.ServerUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.mcVersion !== undefined) data.mcVersion = input.mcVersion;
  if (input.jvmArgs !== undefined) data.jvmArgs = input.jvmArgs;
  if (input.env !== undefined) data.env = input.env;
  if (input.backupRetention !== undefined) data.backupRetention = input.backupRetention;
  if (input.databaseLimit !== undefined) data.databaseLimit = input.databaseLimit;
  if (input.cpuPercent !== undefined) data.cpuPercent = input.cpuPercent;

  if (input.memoryMb !== undefined || input.diskMb !== undefined) {
    const memoryMb = input.memoryMb ?? server.memoryMb;
    const diskMb = input.diskMb ?? server.diskMb;
    await assertCapacity(server.nodeId, memoryMb, diskMb, server.id);
    data.memoryMb = memoryMb;
    data.diskMb = diskMb;
  }
  if (input.port !== undefined && input.port !== server.port) data.port = await allocatePort(server.nodeId, input.port, server.id);
  if (input.javaVersion !== undefined || input.customImage !== undefined) {
    const javaVersion = input.javaVersion ?? server.javaVersion;
    data.javaVersion = javaVersion;
    data.image = resolveImage(server.software, javaVersion, input.customImage ?? server.image);
  }
  if (input.startupCommand !== undefined && server.software === "CUSTOM") data.startupCommand = input.startupCommand || null;
  if (input.ownerId !== undefined) {
    if (!(await db.user.findUnique({ where: { id: input.ownerId } }))) throw new ApiError(422, "Owner not found");
    data.owner = { connect: { id: input.ownerId } };
  }

  const updated = await db.server.update({ where: { id: server.id }, data });
  await logActivity({
    action: "server.update",
    message: `Updated configuration of ${updated.name}`,
    userId: user.id,
    serverId: server.id,
    metadata: { fields: Object.keys(input) },
    ip,
  });
  const runtimeFields = ["mcVersion", "javaVersion", "jvmArgs", "env", "memoryMb", "cpuPercent", "port", "customImage", "startupCommand"];
  const needsRestart = server.state === "RUNNING" && runtimeFields.some((f) => f in input);
  return { server: updated, needsRestart };
});

export const DELETE = handler<Params>(async ({ req, user, params, ip }) => {
  if (user.role !== "ADMIN") throw forbidden();
  const server = await getServerForUser(user, params.id);
  const force = req.nextUrl.searchParams.get("force") === "true";
  const agent = agentFor(server.node);

  try {
    const s3 = await getS3Config();
    const remote = await db.backup.findMany({ where: { serverId: server.id, storage: "S3", status: "COMPLETED" } });
    if (s3) {
      for (const b of remote) {
        await agent
          .request(`/api/servers/${server.id}/backups/${b.id}`, { method: "DELETE", json: { storage: "S3", s3 } })
          .catch(() => undefined);
      }
    }
    await agent.request(`/api/servers/${server.id}`, { method: "DELETE", timeoutMs: 120_000 });
  } catch (err) {
    if (!force) throw err;
  }

  const databases = await db.serverDatabase.findMany({ where: { serverId: server.id }, include: { host: true } });
  for (const d of databases) {
    await dropDatabase(connectionOf(d.host), d).catch((err: unknown) => {
      if (!force) throw err;
    });
  }

  const schedules = await db.schedule.findMany({ where: { serverId: server.id }, select: { id: true } });
  await Promise.all(schedules.map((s) => removeSchedule(s.id).catch(() => undefined)));
  await db.server.delete({ where: { id: server.id } });
  await logActivity({ action: "server.delete", message: `Deleted server ${server.name}`, userId: user.id, nodeId: server.nodeId, ip });
});
