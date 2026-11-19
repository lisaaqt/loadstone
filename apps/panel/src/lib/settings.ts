import { z } from "zod";
import type { S3Config, SftpConfig } from "@loadstone/shared";
import { db } from "./db";
import { decrypt, encrypt } from "./crypto";

export const generalSettingsSchema = z.object({
  panelName: z.string().trim().min(1).max(64).default("Loadstone"),
  defaultBackupRetention: z.number().int().min(1).max(500).default(10),
  defaultBackupStorage: z.enum(["LOCAL", "S3", "SFTP"]).default("LOCAL"),
});
export type GeneralSettings = z.infer<typeof generalSettingsSchema>;

export const storageSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  endpoint: z.string().trim().url().or(z.literal("")).default(""),
  region: z.string().trim().min(1).default("us-east-1"),
  bucket: z.string().trim().default(""),
  accessKeyId: z.string().trim().default(""),
  secretAccessKey: z.string().default(""),
  forcePathStyle: z.boolean().default(true),
  prefix: z.string().trim().default("loadstone/"),
});
export type StorageSettings = z.infer<typeof storageSettingsSchema>;

async function read(key: string): Promise<unknown> {
  const row = await db.setting.findUnique({ where: { key } });
  return row?.value ?? {};
}

async function write(key: string, value: object) {
  await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

export async function getGeneralSettings(): Promise<GeneralSettings> {
  return generalSettingsSchema.parse(await read("general"));
}

export async function saveGeneralSettings(value: GeneralSettings) {
  await write("general", generalSettingsSchema.parse(value));
}

export async function getStorageSettings(): Promise<StorageSettings> {
  const raw = (await read("storage")) as Record<string, unknown>;
  const secret = typeof raw.secretAccessKeyEncrypted === "string" ? decrypt(raw.secretAccessKeyEncrypted) : "";
  return storageSettingsSchema.parse({ ...raw, secretAccessKey: secret });
}

export async function saveStorageSettings(value: StorageSettings) {
  const parsed = storageSettingsSchema.parse(value);
  const { secretAccessKey, ...rest } = parsed;
  await write("storage", { ...rest, secretAccessKeyEncrypted: secretAccessKey ? encrypt(secretAccessKey) : null });
}

export const sftpSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  host: z.string().trim().max(253).default(""),
  port: z.number().int().min(1).max(65535).default(22),
  username: z.string().trim().max(128).default(""),
  authMethod: z.enum(["password", "key"]).default("password"),
  password: z.string().max(1024).default(""),
  privateKey: z.string().max(16384).default(""),
  passphrase: z.string().max(1024).default(""),
  path: z.string().trim().max(512).default("/loadstone"),
});
export type SftpSettings = z.infer<typeof sftpSettingsSchema>;

const SFTP_SECRETS = ["password", "privateKey", "passphrase"] as const;

export async function getSftpSettings(): Promise<SftpSettings> {
  const raw = (await read("sftp")) as Record<string, unknown>;
  const secrets = Object.fromEntries(
    SFTP_SECRETS.map((k) => [k, typeof raw[`${k}Encrypted`] === "string" ? decrypt(raw[`${k}Encrypted`] as string) : ""]),
  );
  return sftpSettingsSchema.parse({ ...raw, ...secrets });
}

export async function saveSftpSettings(value: SftpSettings) {
  const parsed = sftpSettingsSchema.parse(value);
  const plain: Record<string, unknown> = { ...parsed };
  for (const k of SFTP_SECRETS) {
    delete plain[k];
    plain[`${k}Encrypted`] = parsed[k] ? encrypt(parsed[k]) : null;
  }
  await write("sftp", plain);
}

export async function getSftpConfig(): Promise<SftpConfig | null> {
  const s = await getSftpSettings();
  const secret = s.authMethod === "key" ? s.privateKey : s.password;
  if (!s.enabled || !s.host || !s.username || !secret) return null;
  return {
    host: s.host,
    port: s.port,
    username: s.username,
    ...(s.authMethod === "key" ? { privateKey: s.privateKey, passphrase: s.passphrase || undefined } : { password: s.password }),
    path: s.path || "/loadstone",
  };
}

export async function getS3Config(): Promise<S3Config | null> {
  const s = await getStorageSettings();
  if (!s.enabled || !s.bucket || !s.accessKeyId || !s.secretAccessKey) return null;
  return {
    endpoint: s.endpoint || undefined,
    region: s.region,
    bucket: s.bucket,
    accessKeyId: s.accessKeyId,
    secretAccessKey: s.secretAccessKey,
    forcePathStyle: s.forcePathStyle,
    prefix: s.prefix,
  };
}
