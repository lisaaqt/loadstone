import { CronExpressionParser } from "cron-parser";
import cronstrue from "cronstrue";
import { z } from "zod";
import { cronSchema } from "./validation";

export const SCHEDULE_ACTIONS = ["COMMAND", "RESTART", "START", "STOP", "BACKUP", "CLEANUP"] as const;

export const scheduleInputSchema = z
  .object({
    name: z.string().trim().min(1).max(64),
    cron: cronSchema,
    timezone: z.string().max(64).default("UTC"),
    action: z.enum(SCHEDULE_ACTIONS),
    payload: z.string().trim().max(1024).regex(/^[^\r\n\0]*$/, "Payload must be a single line").optional().nullable(),
    enabled: z.boolean().default(true),
    onlyWhenRunning: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    try {
      CronExpressionParser.parse(v.cron, { tz: v.timezone });
    } catch {
      ctx.addIssue({ code: "custom", path: ["cron"], message: "Invalid cron expression or timezone" });
    }
    if (v.action === "COMMAND" && !v.payload) ctx.addIssue({ code: "custom", path: ["payload"], message: "A command is required" });
    if (v.action === "CLEANUP" && v.payload && !/^\d{1,4}$/.test(v.payload))
      ctx.addIssue({ code: "custom", path: ["payload"], message: "Cleanup payload must be the number of days to keep" });
  });

export function nextRuns(cron: string, timezone: string, count = 3): string[] {
  try {
    const it = CronExpressionParser.parse(cron, { tz: timezone });
    return Array.from({ length: count }, () => it.next().toISOString() ?? "").filter(Boolean);
  } catch {
    return [];
  }
}

export function describeCron(cron: string): string {
  try {
    return cronstrue.toString(cron, { use24HourTimeFormat: true, verbose: false });
  } catch {
    return cron;
  }
}
