import { z } from "zod";

export { AGENT_VERSION } from "./version";

export const envKeySchema = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,127}$/, "Invalid environment variable name");

export const serverSpecSchema = z.object({
  image: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9][a-z0-9._/:@-]*$/i, "Invalid image reference"),
  env: z.record(envKeySchema, z.string().max(8192)),
  memoryMb: z.number().int().min(256).max(1024 * 1024),
  cpuPercent: z.number().int().min(0).max(25600),
  diskMb: z.number().int().min(0),
  port: z.number().int().min(1).max(65535),
  internalPort: z.number().int().min(1).max(65535),
  dataPath: z.string().regex(/^\/[A-Za-z0-9._/-]*$/, "Invalid data path"),
  startupCommand: z.string().max(4096).nullable().optional(),
  commandMode: z.enum(["rcon", "stdin"]),
});
export type ServerSpec = z.infer<typeof serverSpecSchema>;

export type ServerRuntimeState = "missing" | "offline" | "starting" | "running" | "stopping";

export const powerActionSchema = z.object({
  action: z.enum(["start", "stop", "restart", "kill"]),
});
export type PowerAction = z.infer<typeof powerActionSchema>["action"];

export interface ServerStats {
  state: ServerRuntimeState;
  cpuPercent: number;
  memoryBytes: number;
  memoryLimitBytes: number;
  networkRxBytes: number;
  networkTxBytes: number;
  startedAt: string | null;
  diskBytes: number;
}

export interface ContainerSummary {
  serverId: string;
  containerId: string;
  state: ServerRuntimeState;
}

export interface SystemInfo {
  agentVersion: string;
  hostname: string;
  platform: string;
  release: string;
  cpuCount: number;
  cpuModel: string;
  cpuPercent: number;
  memoryTotalBytes: number;
  memoryUsedBytes: number;
  diskTotalBytes: number;
  diskUsedBytes: number;
  uptimeSeconds: number;
  docker: { version: string; containers: number; running: number } | null;
}

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory" | "symlink";
  size: number;
  modifiedAt: string;
  editable: boolean;
}

export const s3ConfigSchema = z.object({
  endpoint: z.string().url().optional().or(z.literal("")),
  region: z.string().min(1).default("us-east-1"),
  bucket: z.string().min(1),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  forcePathStyle: z.boolean().default(true),
  prefix: z.string().default("loadstone/"),
});
export type S3Config = z.infer<typeof s3ConfigSchema>;

/** SFTP backup target; authenticate with a password or a private key (optionally passphrase-protected). */
export const sftpConfigSchema = z
  .object({
    host: z.string().trim().min(1).max(253),
    port: z.number().int().min(1).max(65535).default(22),
    username: z.string().trim().min(1).max(128),
    password: z.string().max(1024).optional(),
    privateKey: z.string().max(16384).optional(),
    passphrase: z.string().max(1024).optional(),
    path: z.string().trim().min(1).max(512).default("/loadstone"),
  })
  .refine((v) => Boolean(v.password) || Boolean(v.privateKey), { message: "Enter a password or a private key", path: ["password"] });
export type SftpConfig = z.infer<typeof sftpConfigSchema>;

export const STORAGE_DRIVERS = ["LOCAL", "S3", "SFTP"] as const;

export const backupRequestSchema = z.object({
  backupId: z.string().regex(/^[a-z0-9]{8,40}$/),
  storage: z.enum(STORAGE_DRIVERS),
  s3: s3ConfigSchema.optional(),
  sftp: sftpConfigSchema.optional(),
  ignore: z.array(z.string().max(512)).max(200).default([]),
});
export type BackupRequest = z.infer<typeof backupRequestSchema>;

export const backupLocationSchema = z.object({
  storage: z.enum(STORAGE_DRIVERS),
  s3: s3ConfigSchema.optional(),
  sftp: sftpConfigSchema.optional(),
});
export type BackupLocation = z.infer<typeof backupLocationSchema>;

export interface OperationStatus {
  id: string;
  kind: "backup" | "restore" | "install";
  status: "running" | "completed" | "failed";
  progress: number;
  sizeBytes?: number;
  checksum?: string;
  error?: string;
}

export const ALLOWED_DOWNLOAD_HOSTS = [
  "cdn.modrinth.com",
  "hangarcdn.papermc.io",
  "hangar.papermc.io",
] as const;

export const pluginInstallSchema = z.object({
  url: z.string().url(),
  directory: z.enum(["plugins", "mods"]),
  fileName: z.string().regex(/^[A-Za-z0-9 ._+()\[\]-]{1,200}\.jar$/, "Invalid jar file name"),
  sha512: z.string().regex(/^[a-f0-9]{128}$/).optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  replaces: z.string().regex(/^[A-Za-z0-9 ._+()\[\]-]{1,200}\.jar$/).optional(),
});
export type PluginInstall = z.infer<typeof pluginInstallSchema>;

export interface WorldInfo {
  name: string;
  sizeBytes: number;
  modifiedAt: string;
  dimensions: string[];
}

export type ConsoleServerMessage =
  | { type: "log"; lines: string[] }
  | { type: "status"; state: ServerRuntimeState }
  | { type: "stats"; stats: ServerStats }
  | { type: "error"; message: string };

export type ConsoleClientMessage = { type: "command"; command: string };

export const commandSchema = z.object({
  command: z
    .string()
    .trim()
    .min(1)
    .max(1024)
    .refine((v) => !/[\r\n\0]/.test(v), "Command must be a single line"),
});
