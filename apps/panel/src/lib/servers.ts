import { z } from "zod";
import { envKeySchema, imageFor, JAVA_VERSIONS, SOFTWARE, SOFTWARE_IDS } from "@loadstone/shared";
import { db } from "./db";
import { ApiError } from "./api";
import { env } from "./env";
import type { AuthUser } from "./session";

const RESERVED_ENV = new Set(["EULA", "TYPE", "MEMORY", "INIT_MEMORY", "MAX_MEMORY", "ENABLE_RCON", "RCON_PASSWORD", "RCON_PORT", "CREATE_CONSOLE_IN_PIPE", "UID", "GID"]);

export const envSchema = z
  .record(envKeySchema, z.string().max(4096))
  .refine((env) => Object.keys(env).length <= 64, "At most 64 environment variables")
  .refine((env) => Object.keys(env).every((k) => !RESERVED_ENV.has(k.toUpperCase())), "Contains a reserved variable managed by Loadstone");

export const mcVersionSchema = z
  .string()
  .trim()
  .regex(/^(LATEST|SNAPSHOT|\d+(\.\d+){1,2}(-[A-Za-z0-9.]+)?|\d{2}w\d{2}[a-z])$/, "Invalid Minecraft version");

export const imageSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[a-z0-9][a-z0-9._/:@-]*$/i, "Invalid Docker image reference");

export const jvmArgsSchema = z
  .string()
  .max(2048)
  .refine((v) => !/[\r\n\0`$;|&<>]/.test(v), "JVM arguments contain unsupported characters");

export const createServerSchema = z
  .object({
    name: z.string().trim().min(1).max(48),
    description: z.string().trim().max(280).optional(),
    nodeId: z.string().optional(),
    ownerId: z.string().optional(),
    software: z.enum(SOFTWARE_IDS),
    mcVersion: mcVersionSchema.default("LATEST"),
    javaVersion: z.enum(JAVA_VERSIONS).default("21"),
    memoryMb: z.number().int().min(512).max(262144),
    cpuPercent: z.number().int().min(0).max(25600),
    diskMb: z.number().int().min(1024).max(4194304),
    port: z.number().int().min(1024).max(65535).optional(),
    env: envSchema.default({}),
    jvmArgs: jvmArgsSchema.default(""),
    customImage: imageSchema.optional(),
    startupCommand: z.string().max(4096).optional(),
    internalPort: z.number().int().min(1).max(65535).optional(),
    dataPath: z.string().regex(/^\/[A-Za-z0-9._/-]*$/).optional(),
    startOnCreate: z.boolean().default(true),
  })
  .refine((v) => v.software !== "CUSTOM" || !!v.customImage, { message: "A Docker image is required", path: ["customImage"] });

export type CreateServerInput = z.infer<typeof createServerSchema>;

/** How many servers this user may still create themselves (admins are unlimited). */
export async function serverQuota(user: AuthUser) {
  if (user.role === "ADMIN") return { canCreate: true, limit: null, used: 0, caps: null };
  const config = env();
  const used = await db.server.count({ where: { ownerId: user.id } });
  return {
    canCreate: used < config.USER_SERVER_LIMIT,
    limit: config.USER_SERVER_LIMIT,
    used,
    caps: { memoryMb: config.USER_SERVER_MAX_MEMORY_MB, diskMb: config.USER_SERVER_MAX_DISK_MB, cpuPercent: config.USER_SERVER_MAX_CPU_PERCENT },
  };
}

export async function nodeUsage(nodeId: string, excludeServerId?: string) {
  const agg = await db.server.aggregate({
    where: { nodeId, ...(excludeServerId ? { id: { not: excludeServerId } } : {}) },
    _sum: { memoryMb: true, diskMb: true },
    _count: true,
  });
  return { memoryMb: agg._sum.memoryMb ?? 0, diskMb: agg._sum.diskMb ?? 0, servers: agg._count };
}

export async function pickNode(memoryMb: number, diskMb: number) {
  const nodes = await db.node.findMany({ where: { status: "ONLINE" } });
  let best: { id: string; free: number } | null = null;
  for (const node of nodes) {
    const usage = await nodeUsage(node.id);
    const freeMem = node.memoryMb - usage.memoryMb;
    const freeDisk = node.diskMb - usage.diskMb;
    if (freeMem >= memoryMb && freeDisk >= diskMb && (!best || freeMem > best.free)) best = { id: node.id, free: freeMem };
  }
  if (!best) throw new ApiError(409, "No online node has enough free memory and disk for this server");
  return best.id;
}

export async function assertCapacity(nodeId: string, memoryMb: number, diskMb: number, excludeServerId?: string) {
  const node = await db.node.findUnique({ where: { id: nodeId } });
  if (!node) throw new ApiError(404, "Node not found");
  const usage = await nodeUsage(nodeId, excludeServerId);
  if (usage.memoryMb + memoryMb > node.memoryMb)
    throw new ApiError(409, `Node ${node.name} only has ${node.memoryMb - usage.memoryMb} MB of allocatable memory left`);
  if (usage.diskMb + diskMb > node.diskMb)
    throw new ApiError(409, `Node ${node.name} only has ${node.diskMb - usage.diskMb} MB of allocatable disk left`);
  return node;
}

export async function allocatePort(nodeId: string, requested?: number, excludeServerId?: string) {
  const node = await db.node.findUniqueOrThrow({ where: { id: nodeId } });
  const used = new Set(
    (
      await db.server.findMany({
        where: { nodeId, ...(excludeServerId ? { id: { not: excludeServerId } } : {}) },
        select: { port: true },
      })
    ).map((s) => s.port),
  );
  if (requested !== undefined) {
    const inRange = requested >= node.portRangeStart && requested <= node.portRangeEnd;
    if (!inRange && !node.extraPorts.includes(requested)) {
      const extra = node.extraPorts.length ? ` or one of ${node.extraPorts.join(", ")}` : "";
      throw new ApiError(422, `Port must be within the node range ${node.portRangeStart}-${node.portRangeEnd}${extra}`);
    }
    if (used.has(requested)) throw new ApiError(409, `Port ${requested} is already allocated on this node`);
    return requested;
  }
  for (let p = node.portRangeStart; p <= node.portRangeEnd; p++) if (!used.has(p)) return p;
  for (const p of node.extraPorts) if (!used.has(p)) return p;
  throw new ApiError(409, "No free ports left in this node's allocation range");
}

export function resolveImage(software: CreateServerInput["software"], javaVersion: string, customImage?: string | null) {
  return imageFor(software, javaVersion, customImage);
}

export function softwareDefaults(software: CreateServerInput["software"]) {
  const def = SOFTWARE[software];
  return { internalPort: def.internalPort, dataPath: def.dataPath };
}
