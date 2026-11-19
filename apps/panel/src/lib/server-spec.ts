import type { Server } from "@/generated/prisma/client";
import { buildServerEnv, commandModeFor, type ServerSpec } from "@loadstone/shared";

export function envRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
}

export function specFor(server: Server): ServerSpec {
  return {
    image: server.image,
    env: buildServerEnv({
      software: server.software,
      mcVersion: server.mcVersion,
      memoryMb: server.memoryMb,
      jvmArgs: server.jvmArgs,
      env: envRecord(server.env),
    }),
    memoryMb: server.memoryMb,
    cpuPercent: server.cpuPercent,
    diskMb: server.diskMb,
    port: server.port,
    internalPort: server.internalPort,
    dataPath: server.dataPath,
    startupCommand: server.startupCommand,
    commandMode: commandModeFor(server.software),
  };
}
