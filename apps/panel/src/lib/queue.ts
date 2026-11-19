import { Queue } from "bullmq";
import type { Schedule } from "@/generated/prisma/client";
import { redis } from "./redis";

export const QUEUE_NAME = "loadstone";

export type JobPayloads = {
  "server.install": { serverId: string; start?: boolean };
  "backup.create": { backupId: string };
  "backup.restore": { backupId: string; userId?: string };
  "schedule.run": { scheduleId: string };
  "nodes.poll": Record<string, never>;
  "maintenance.prune": Record<string, never>;
};

export type JobName = keyof JobPayloads;

const globalForQueue = globalThis as unknown as { loadstoneQueue?: Queue };

export function queue(): Queue {
  if (!globalForQueue.loadstoneQueue) {
    globalForQueue.loadstoneQueue = new Queue(QUEUE_NAME, {
      connection: redis(),
      defaultJobOptions: { removeOnComplete: 500, removeOnFail: 1000 },
    });
  }
  return globalForQueue.loadstoneQueue;
}

export async function enqueue<N extends JobName>(name: N, data: JobPayloads[N], opts: { jobId?: string; attempts?: number } = {}) {
  return queue().add(name, data, {
    jobId: opts.jobId,
    attempts: opts.attempts ?? 1,
    backoff: { type: "exponential", delay: 5000 },
  });
}

export function scheduleJobId(scheduleId: string) {
  return `schedule-${scheduleId}`;
}

export async function syncSchedule(schedule: Pick<Schedule, "id" | "cron" | "timezone" | "enabled">) {
  const q = queue();
  if (!schedule.enabled) {
    await q.removeJobScheduler(scheduleJobId(schedule.id));
    return;
  }
  await q.upsertJobScheduler(
    scheduleJobId(schedule.id),
    { pattern: schedule.cron, tz: schedule.timezone },
    { name: "schedule.run", data: { scheduleId: schedule.id }, opts: { removeOnComplete: 100, removeOnFail: 200 } },
  );
}

export async function removeSchedule(scheduleId: string) {
  await queue().removeJobScheduler(scheduleJobId(scheduleId));
}
