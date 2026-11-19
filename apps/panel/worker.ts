import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { loadEnvConfig } from "@next/env";
import type { Backup, Server, Node } from "@/generated/prisma/client";
import { isProxySoftware, type ContainerSummary, type OperationStatus } from "@loadstone/shared";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { agentFor, type AgentClient } from "@/lib/agent-client";
import { QUEUE_NAME, queue, scheduleJobId, syncSchedule, type JobName, type JobPayloads } from "@/lib/queue";
import { specFor } from "@/lib/server-spec";
import { logActivity } from "@/lib/activity";
import { backupLocation, DEFAULT_BACKUP_IGNORE } from "@/lib/backups";
import { probeNode } from "@/lib/nodes";
import { sendTemplate } from "@/lib/mail";
import { runtimeToState } from "@/components/servers/state";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
const config = env();
const connection = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });
const log = (...args: unknown[]) => console.log(`[worker ${new Date().toISOString()}]`, ...args);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForOperation(agent: AgentClient, opId: string, onProgress: (p: number) => Promise<void>, timeoutMs = 6 * 3600_000) {
  const started = Date.now();
  let last = -1;
  while (Date.now() - started < timeoutMs) {
    await sleep(1500);
    const op = await agent.request<OperationStatus>(`/api/operations/${opId}`, { timeoutMs: 10_000 });
    if (op.progress !== last) {
      last = op.progress;
      await onProgress(op.progress);
    }
    if (op.status === "completed") return op;
    if (op.status === "failed") throw new Error(op.error ?? "Operation failed");
  }
  throw new Error("Operation timed out");
}

async function loadServer(serverId: string) {
  return db.server.findUnique({ where: { id: serverId }, include: { node: true } });
}

async function trySend(agent: AgentClient, server: Server, command: string) {
  try {
    await agent.request(`/api/servers/${server.id}/command`, { method: "POST", json: { command }, timeoutMs: 15_000 });
    return true;
  } catch {
    return false;
  }
}

async function installServer({ serverId, start }: JobPayloads["server.install"]) {
  const server = await loadServer(serverId);
  if (!server) return;
  const agent = agentFor(server.node);
  try {
    const res = await agent.request<{ containerId: string }>(`/api/servers/${server.id}/install`, {
      method: "POST",
      json: { spec: specFor(server) },
      timeoutMs: 30 * 60_000,
    });
    await db.server.update({ where: { id: server.id }, data: { containerId: res.containerId, state: "OFFLINE", installError: null, stateChangedAt: new Date() } });
    await logActivity({ action: "server.installed", message: `Finished installing ${server.name}`, serverId: server.id, nodeId: server.nodeId });
    if (start) {
      await agent.request(`/api/servers/${server.id}/power`, { method: "POST", json: { action: "start", spec: specFor(server) } });
      await db.server.update({ where: { id: server.id }, data: { state: "STARTING", stateChangedAt: new Date() } });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.server.update({ where: { id: server.id }, data: { state: "ERROR", installError: message.slice(0, 1000), stateChangedAt: new Date() } });
    await logActivity({ action: "server.install.failed", message: `Installation of ${server.name} failed: ${message}`, serverId: server.id, nodeId: server.nodeId });
    throw err;
  }
}

async function applyRetention(server: Server & { node: Node }) {
  const completed = await db.backup.findMany({
    where: { serverId: server.id, status: "COMPLETED", locked: false },
    orderBy: { createdAt: "desc" },
  });
  const excess = completed.slice(server.backupRetention);
  const agent = agentFor(server.node);
  for (const b of excess) {
    try {
      const location = await backupLocation(b.storage);
      await agent.request(`/api/servers/${server.id}/backups/${b.id}`, { method: "DELETE", json: location });
      await db.backup.delete({ where: { id: b.id } });
      log(`retention removed backup ${b.id} of ${server.name}`);
    } catch (err) {
      log(`retention failed for ${b.id}:`, (err as Error).message);
    }
  }
}

async function createBackup(backup: Backup) {
  const server = await loadServer(backup.serverId);
  if (!server) return;
  const agent = agentFor(server.node);
  const running = server.state === "RUNNING" && !isProxySoftware(server.software) && server.software !== "CUSTOM";
  await db.backup.update({ where: { id: backup.id }, data: { status: "RUNNING", progress: 0, error: null } });
  let savingDisabled = false;
  try {
    const location = await backupLocation(backup.storage);
    if (running) {
      savingDisabled = await trySend(agent, server, "save-off");
      await trySend(agent, server, "save-all flush");
      await sleep(3000);
    }
    await agent.request(`/api/servers/${server.id}/backups`, {
      method: "POST",
      json: { backupId: backup.id, ignore: backup.ignore.length ? backup.ignore : DEFAULT_BACKUP_IGNORE, ...location },
    });
    const op = await waitForOperation(agent, backup.id, (progress) => db.backup.update({ where: { id: backup.id }, data: { progress } }).then(() => undefined));
    await db.backup.update({
      where: { id: backup.id },
      data: { status: "COMPLETED", progress: 100, sizeBytes: BigInt(op.sizeBytes ?? 0), checksum: op.checksum ?? null, completedAt: new Date() },
    });
    await logActivity({ action: "backup.completed", message: `Backup "${backup.name}" of ${server.name} completed`, serverId: server.id });
    await applyRetention(server);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.backup.update({ where: { id: backup.id }, data: { status: "FAILED", error: message.slice(0, 1000) } });
    await logActivity({ action: "backup.failed", message: `Backup "${backup.name}" of ${server.name} failed: ${message}`, serverId: server.id });
    const owner = await db.user.findUnique({ where: { id: server.ownerId }, select: { name: true, email: true } });
    if (owner) {
      const serverUrl = `${(process.env.APP_URL ?? "").replace(/\/$/, "")}/servers/${server.id}/backups`;
      await sendTemplate("backupFailed", owner.email, { userName: owner.name, serverName: server.name, backupName: backup.name, error: message, serverUrl }).catch(
        (mailErr: unknown) => log(`could not email backup failure: ${mailErr instanceof Error ? mailErr.message : String(mailErr)}`),
      );
    }
    throw err;
  } finally {
    if (savingDisabled) await trySend(agent, server, "save-on");
  }
}

async function restoreBackup({ backupId }: JobPayloads["backup.restore"]) {
  const backup = await db.backup.findUnique({ where: { id: backupId } });
  if (!backup) return;
  const server = await loadServer(backup.serverId);
  if (!server) return;
  const agent = agentFor(server.node);
  // Lock the server while its files are replaced; the agent stops it before restoring.
  await db.server.update({ where: { id: server.id }, data: { state: "RESTORING", stateChangedAt: new Date() } });
  try {
    const location = await backupLocation(backup.storage);
    await agent.request(`/api/servers/${server.id}/backups/${backup.id}/restore`, { method: "POST", json: location });
    await waitForOperation(agent, `restore-${backup.id}`, (progress) => db.backup.update({ where: { id: backup.id }, data: { progress } }).then(() => undefined));
    await db.backup.update({ where: { id: backup.id }, data: { status: "COMPLETED", progress: 100, error: null } });
    await logActivity({ action: "backup.restored", message: `Restored "${backup.name}" on ${server.name}`, serverId: server.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.backup.update({ where: { id: backup.id }, data: { status: "COMPLETED", progress: 100, error: `Restore failed: ${message}`.slice(0, 1000) } });
    await logActivity({ action: "backup.restore.failed", message: `Restoring "${backup.name}" on ${server.name} failed: ${message}`, serverId: server.id });
    throw err;
  } finally {
    await db.server.update({ where: { id: server.id }, data: { state: "OFFLINE", stateChangedAt: new Date() } });
  }
}

async function runSchedule({ scheduleId }: JobPayloads["schedule.run"]) {
  const schedule = await db.schedule.findUnique({ where: { id: scheduleId } });
  if (!schedule) {
    await queue().removeJobScheduler(scheduleJobId(scheduleId));
    return;
  }
  const server = await loadServer(schedule.serverId);
  if (!server) return;
  const agent = agentFor(server.node);
  const finish = (lastStatus: string, lastError: string | null = null) =>
    db.schedule.update({ where: { id: schedule.id }, data: { lastRunAt: new Date(), lastStatus, lastError } });

  if (schedule.onlyWhenRunning && server.state !== "RUNNING") {
    await finish("skipped", "Server was not running");
    return;
  }
  try {
    switch (schedule.action) {
      case "COMMAND":
        await agent.request(`/api/servers/${server.id}/command`, { method: "POST", json: { command: schedule.payload ?? "" } });
        break;
      case "START":
      case "RESTART":
        await agent.request(`/api/servers/${server.id}/power`, { method: "POST", json: { action: schedule.action.toLowerCase(), spec: specFor(server) } });
        await db.server.update({ where: { id: server.id }, data: { state: "STARTING", stateChangedAt: new Date() } });
        break;
      case "STOP":
        await agent.request(`/api/servers/${server.id}/power`, { method: "POST", json: { action: "stop" } });
        await db.server.update({ where: { id: server.id }, data: { state: "STOPPING", stateChangedAt: new Date() } });
        break;
      case "BACKUP": {
        const busy = await db.backup.count({ where: { serverId: server.id, status: { in: ["PENDING", "RUNNING", "RESTORING"] } } });
        if (busy) throw new Error("Another backup operation is in progress");
        const settings = await db.setting.findUnique({ where: { key: "general" } });
        const storage = ((settings?.value as { defaultBackupStorage?: "LOCAL" | "S3" } | null)?.defaultBackupStorage ?? "LOCAL") as "LOCAL" | "S3";
        const backup = await db.backup.create({
          data: { serverId: server.id, name: schedule.name, storage, scheduled: true, ignore: DEFAULT_BACKUP_IGNORE },
        });
        await createBackup(backup);
        break;
      }
      case "CLEANUP":
        await agent.request(`/api/servers/${server.id}/cleanup`, { method: "POST", json: { days: Number(schedule.payload || 7) } });
        break;
    }
    await finish("success");
    await logActivity({ action: "schedule.executed", message: `Schedule "${schedule.name}" ran on ${server.name}`, serverId: server.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finish("failed", message.slice(0, 500));
    await logActivity({ action: "schedule.failed", message: `Schedule "${schedule.name}" failed on ${server.name}: ${message}`, serverId: server.id });
  }
}

async function pollNodes() {
  const nodes = await db.node.findMany();
  await Promise.all(
    nodes.map(async (node) => {
      const result = await probeNode(node);
      if (!result.ok) return;
      const { info } = result;
      await db.nodeMetric.create({
        data: {
          nodeId: node.id,
          cpuPercent: info.cpuPercent,
          memoryUsedBytes: BigInt(info.memoryUsedBytes),
          memoryTotalBytes: BigInt(info.memoryTotalBytes),
          diskUsedBytes: BigInt(info.diskUsedBytes),
          diskTotalBytes: BigInt(info.diskTotalBytes),
        },
      });
      try {
        const { containers } = await agentFor(node).request<{ containers: ContainerSummary[] }>("/api/servers", { timeoutMs: 10_000 });
        const byId = new Map(containers.map((c) => [c.serverId, c]));
        const servers = await db.server.findMany({ where: { nodeId: node.id }, select: { id: true, state: true } });
        for (const s of servers) {
          if (s.state === "INSTALLING" || s.state === "RESTORING") continue;
          const container = byId.get(s.id);
          if (!container) continue;
          const state = runtimeToState(container.state);
          if (s.state === "ERROR" && state === "OFFLINE") continue;
          if (state !== s.state) await db.server.update({ where: { id: s.id }, data: { state, stateChangedAt: new Date() } });
        }
      } catch (err) {
        log(`failed to sync containers on ${node.name}:`, (err as Error).message);
      }
    }),
  );
}

async function prune() {
  const now = Date.now();
  const [metrics, sessions, activity] = await Promise.all([
    db.nodeMetric.deleteMany({ where: { createdAt: { lt: new Date(now - 7 * 86400_000) } } }),
    db.session.deleteMany({ where: { expiresAt: { lt: new Date(now) } } }),
    db.activity.deleteMany({ where: { createdAt: { lt: new Date(now - 365 * 86400_000) } } }),
  ]);
  log(`pruned ${metrics.count} metrics, ${sessions.count} sessions, ${activity.count} activity entries`);
}

async function processJob(job: Job) {
  const name = job.name as JobName;
  switch (name) {
    case "server.install":
      return installServer(job.data as JobPayloads["server.install"]);
    case "backup.create": {
      const backup = await db.backup.findUnique({ where: { id: (job.data as JobPayloads["backup.create"]).backupId } });
      if (backup && backup.status === "PENDING") await createBackup(backup);
      return;
    }
    case "backup.restore":
      return restoreBackup(job.data as JobPayloads["backup.restore"]);
    case "schedule.run":
      return runSchedule(job.data as JobPayloads["schedule.run"]);
    case "nodes.poll":
      return pollNodes();
    case "maintenance.prune":
      return prune();
    default:
      log(`unknown job ${job.name}`);
  }
}

async function bootstrap() {
  const interrupted = await db.backup.updateMany({ where: { status: "RUNNING" }, data: { status: "FAILED", error: "Interrupted by a worker restart" } });
  const restoring = await db.backup.updateMany({ where: { status: "RESTORING" }, data: { status: "COMPLETED", error: "Restore interrupted by a worker restart" } });
  await db.server.updateMany({ where: { state: "RESTORING" }, data: { state: "OFFLINE", stateChangedAt: new Date() } });
  if (interrupted.count || restoring.count) log(`recovered ${interrupted.count} interrupted backups and ${restoring.count} restores`);

  const q = queue();
  await q.upsertJobScheduler("nodes-poll", { every: 60_000 }, { name: "nodes.poll", data: {}, opts: { removeOnComplete: 10, removeOnFail: 50 } });
  await q.upsertJobScheduler("maintenance-prune", { every: 3600_000 }, { name: "maintenance.prune", data: {}, opts: { removeOnComplete: 10, removeOnFail: 50 } });

  const schedules = await db.schedule.findMany();
  const known = new Set(schedules.map((s) => scheduleJobId(s.id)));
  for (const s of schedules) await syncSchedule(s).catch((err: unknown) => log(`failed to sync schedule ${s.id}:`, (err as Error).message));
  for (const scheduler of await q.getJobSchedulers()) {
    if (scheduler.key.startsWith("schedule-") && !known.has(scheduler.key)) await q.removeJobScheduler(scheduler.key);
  }
  await q.add("nodes.poll", {}, { removeOnComplete: true });
  log(`synced ${schedules.length} schedules`);
}

const worker = new Worker(QUEUE_NAME, processJob, { connection, concurrency: 8, lockDuration: 120_000 });
worker.on("failed", (job, err) => log(`job ${job?.name} (${job?.id}) failed:`, err.message));
worker.on("error", (err) => log("worker error:", err.message));

bootstrap()
  .then(() => log("worker ready"))
  .catch((err: unknown) => {
    console.error("[worker] bootstrap failed", err);
    process.exitCode = 1;
  });

async function shutdown() {
  log("shutting down");
  await worker.close();
  await connection.quit();
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
