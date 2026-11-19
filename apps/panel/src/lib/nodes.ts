import type { Node } from "@/generated/prisma/client";
import type { SystemInfo } from "@loadstone/shared";
import { z } from "zod";
import { db } from "./db";
import { agentFor } from "./agent-client";

export type PublicNode = Omit<Node, "tokenEncrypted">;

export function publicNode(node: Node): PublicNode {
  const { tokenEncrypted: _t, ...rest } = node;
  return rest;
}

const hostSchema = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .regex(/^[A-Za-z0-9.-]+$|^\[[0-9a-fA-F:]+\]$/, "Enter a hostname or IP address");

export const nodeInputSchema = z
  .object({
    name: z.string().trim().min(1).max(48),
    description: z.string().trim().max(280).nullable().optional(),
    scheme: z.enum(["http", "https"]).default("http"),
    host: hostSchema,
    port: z.number().int().min(1).max(65535).default(8080),
    publicHost: hostSchema,
    memoryMb: z.number().int().min(512),
    diskMb: z.number().int().min(1024),
    portRangeStart: z.number().int().min(1024).max(65535).default(25565),
    portRangeEnd: z.number().int().min(1024).max(65535).default(25665),
    extraPorts: z.array(z.number().int().min(1024).max(65535)).max(100).default([]).transform((ports) => [...new Set(ports)].sort((a, b) => a - b)),
  })
  .refine((v) => v.portRangeEnd >= v.portRangeStart, { message: "Port range end must be after start", path: ["portRangeEnd"] });

export async function probeNode(node: Node) {
  try {
    const info = await agentFor(node).request<SystemInfo>("/api/system", { timeoutMs: 8000 });
    const updated = await db.node.update({
      where: { id: node.id },
      data: {
        status: "ONLINE",
        lastSeenAt: new Date(),
        lastError: null,
        agentVersion: info.agentVersion,
        platform: `${info.platform} ${info.release}`,
        cpuModel: info.cpuModel,
        cpuCount: info.cpuCount,
        cpuPercent: info.cpuPercent,
        memoryTotalBytes: BigInt(info.memoryTotalBytes),
        memoryUsedBytes: BigInt(info.memoryUsedBytes),
        diskTotalBytes: BigInt(info.diskTotalBytes),
        diskUsedBytes: BigInt(info.diskUsedBytes),
      },
    });
    return { ok: true as const, node: updated, info };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const updated = await db.node.update({ where: { id: node.id }, data: { status: "OFFLINE", lastError: message } });
    return { ok: false as const, node: updated, error: message };
  }
}
