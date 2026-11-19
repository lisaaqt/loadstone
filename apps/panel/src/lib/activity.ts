import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";

export interface ActivityInput {
  action: string;
  message: string;
  userId?: string | null;
  serverId?: string | null;
  nodeId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
}

export async function logActivity(input: ActivityInput) {
  try {
    await db.activity.create({
      data: {
        action: input.action,
        message: input.message.slice(0, 1000),
        userId: input.userId ?? null,
        serverId: input.serverId ?? null,
        nodeId: input.nodeId ?? null,
        metadata: input.metadata,
        ip: input.ip ?? null,
      },
    });
  } catch (err) {
    console.error("[activity] failed to record", err);
  }
}
