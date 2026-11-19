import type { Backup, StorageDriver } from "@/generated/prisma/client";
import type { BackupLocation } from "@loadstone/shared";
import { ApiError } from "./api";
import { getS3Config, getSftpConfig } from "./settings";

export async function backupLocation(storage: StorageDriver): Promise<BackupLocation> {
  if (storage === "LOCAL") return { storage: "LOCAL" };
  if (storage === "SFTP") {
    const sftp = await getSftpConfig();
    if (!sftp) throw new ApiError(409, "SFTP storage is not configured. Configure it under Settings → Backup storage.");
    return { storage: "SFTP", sftp };
  }
  const s3 = await getS3Config();
  if (!s3) throw new ApiError(409, "S3 storage is not configured. Configure it under Settings → Storage.");
  return { storage: "S3", s3 };
}

export function backupFileName(serverName: string, backup: Pick<Backup, "name" | "createdAt">) {
  const stamp = backup.createdAt.toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return `${serverName}-${backup.name}-${stamp}.tar.gz`.replace(/[^A-Za-z0-9._-]+/g, "-");
}

export const DEFAULT_BACKUP_IGNORE = ["logs/*.log.gz", "crash-reports", "cache", ".loadstone"];
