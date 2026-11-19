import fs from "node:fs";
import { DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import type { Readable } from "node:stream";
import type { S3Config } from "@loadstone/shared";

function client(cfg: S3Config) {
  return new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint || undefined,
    forcePathStyle: cfg.forcePathStyle,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
}

export function objectKey(cfg: S3Config, serverId: string, backupId: string) {
  const prefix = cfg.prefix ? (cfg.prefix.endsWith("/") ? cfg.prefix : `${cfg.prefix}/`) : "";
  return `${prefix}${serverId}/${backupId}.tar.gz`;
}

export async function uploadFile(cfg: S3Config, key: string, file: string, size: number, onProgress: (pct: number) => void) {
  const upload = new Upload({
    client: client(cfg),
    params: { Bucket: cfg.bucket, Key: key, Body: fs.createReadStream(file), ContentType: "application/gzip" },
    queueSize: 4,
    partSize: 16 * 1024 * 1024,
  });
  upload.on("httpUploadProgress", (p) => p.loaded && size && onProgress((p.loaded / size) * 100));
  await upload.done();
}

export async function downloadStream(cfg: S3Config, key: string): Promise<{ body: Readable; size?: number }> {
  const res = await client(cfg).send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
  return { body: res.Body as Readable, size: res.ContentLength };
}

export async function deleteObject(cfg: S3Config, key: string) {
  await client(cfg).send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
}
