import path from "node:path";
import { z } from "zod";

const schema = z.object({
  LOADSTONE_TOKEN: z.string().min(32, "LOADSTONE_TOKEN must be at least 32 characters"),
  LOADSTONE_HOST: z.string().default("0.0.0.0"),
  LOADSTONE_PORT: z.coerce.number().int().default(8080),
  LOADSTONE_DATA_DIR: z.string().default(process.platform === "win32" ? path.resolve(".data/agent") : "/var/lib/loadstone"),
  LOADSTONE_HOST_DATA_DIR: z.string().optional(),
  LOADSTONE_TLS_CERT: z.string().optional(),
  LOADSTONE_TLS_KEY: z.string().optional(),
  LOADSTONE_NODE_ID: z.string().optional(),
  LOADSTONE_LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  LOADSTONE_MAX_UPLOAD_MB: z.coerce.number().int().default(4096),
  // Server images to download in the background: recommended | all | none | comma-separated image list.
  LOADSTONE_PREPULL: z.string().trim().default("recommended"),
  // Optional Docker Hub login for image pulls (raises the anonymous rate limit).
  DOCKER_HUB_USERNAME: z.string().trim().optional(),
  DOCKER_HUB_TOKEN: z.string().trim().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid agent configuration:");
  for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  process.exit(1);
}

const dataDir = path.resolve(parsed.data.LOADSTONE_DATA_DIR);

export const config = {
  token: parsed.data.LOADSTONE_TOKEN,
  host: parsed.data.LOADSTONE_HOST,
  port: parsed.data.LOADSTONE_PORT,
  dataDir,
  hostDataDir: parsed.data.LOADSTONE_HOST_DATA_DIR ? path.resolve(parsed.data.LOADSTONE_HOST_DATA_DIR) : dataDir,
  tlsCert: parsed.data.LOADSTONE_TLS_CERT,
  tlsKey: parsed.data.LOADSTONE_TLS_KEY,
  nodeId: parsed.data.LOADSTONE_NODE_ID,
  logLevel: parsed.data.LOADSTONE_LOG_LEVEL,
  maxUploadBytes: parsed.data.LOADSTONE_MAX_UPLOAD_MB * 1024 * 1024,
  prepull: parsed.data.LOADSTONE_PREPULL,
  dockerHubUsername: parsed.data.DOCKER_HUB_USERNAME,
  dockerHubToken: parsed.data.DOCKER_HUB_TOKEN,
  dirs: {
    servers: path.join(dataDir, "servers"),
    backups: path.join(dataDir, "backups"),
    meta: path.join(dataDir, "meta"),
    tmp: path.join(dataDir, "tmp"),
  },
};
