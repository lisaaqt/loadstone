import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  APP_SECRET: z.string().min(32, "APP_SECRET must be at least 32 characters"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  PORT: z.coerce.number().int().default(3000),
  HOST: z.string().default("0.0.0.0"),
  ALLOWED_ORIGINS: z
    .string()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => (s.includes("://") ? new URL(s).host : s)),
    ),
  AGENT_IMAGE: z.string().trim().min(1).default("lisaaqt/loadstone-agent:latest"),
  // Update check: version tags of this image are compared with the running panel version.
  UPDATE_CHECK: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  UPDATE_IMAGE: z.string().trim().min(1).default("lisaaqt/loadstone-panel"),
  UPDATE_REGISTRY_USERNAME: z.string().trim().optional(),
  UPDATE_REGISTRY_PASSWORD: z.string().optional(),
  // Self-service: how many servers a non-admin user may create themselves (0 = only admins create servers),
  // and the most RAM / disk / CPU each of those servers may get.
  USER_SERVER_LIMIT: z.coerce.number().int().min(0).default(0),
  USER_SERVER_MAX_MEMORY_MB: z.coerce.number().int().min(512).default(4096),
  USER_SERVER_MAX_DISK_MB: z.coerce.number().int().min(1024).default(20480),
  USER_SERVER_MAX_CPU_PERCENT: z.coerce.number().int().min(0).default(200),
  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function secureCookies(): boolean {
  return env().APP_URL.startsWith("https://");
}
