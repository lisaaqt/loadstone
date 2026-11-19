import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as tar from "tar";
import type { BackupLocation, BackupRequest } from "@loadstone/shared";
import { config } from "./config.js";
import { conflict, notFound } from "./errors.js";
import { assertId, dirSize, globToRegExp, invalidateUsage, serverRoot } from "./paths.js";
import { repairOwnership } from "./ownership.js";
import { getState } from "./docker.js";
import { startOperation } from "./operations.js";
import { hub } from "./hub.js";
import * as s3 from "./s3.js";
import * as sftp from "./sftp.js";

const localPath = (serverId: string, backupId: string) => path.join(config.dirs.backups, assertId(serverId), `${assertId(backupId, "backup id")}.tar.gz`);

function counter(onBytes: (n: number) => void) {
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      onBytes(chunk.length);
      cb(null, chunk);
    },
  });
}

export function createBackup(serverId: string, req: BackupRequest) {
  const root = serverRoot(serverId);
  const ignore = req.ignore.map(globToRegExp);
  return startOperation(req.backupId, "backup", async (progress) => {
    await fsp.mkdir(path.join(config.dirs.backups, serverId), { recursive: true });
    const target = req.storage === "LOCAL" ? localPath(serverId, req.backupId) : path.join(config.dirs.tmp, `${req.backupId}.tar.gz`);
    const total = Math.max(1, await dirSize(root));
    let processed = 0;
    const hash = createHash("sha256");
    const entries = (await fsp.readdir(root)).filter((name) => !ignore.some((re) => re.test(name)));
    hub.system(serverId, `Backup ${req.backupId} started`);
    try {
      const stream = tar.c(
        {
          gzip: { level: 6 },
          cwd: root,
          portable: true,
          follow: false,
          filter: (p, stat) => {
            const rel = p.replace(/^\.\//, "").split(path.sep).join("/");
            if (ignore.some((re) => re.test(rel))) return false;
            if ("size" in stat && (stat as fs.Stats).isFile?.()) {
              processed += (stat as fs.Stats).size;
              progress((processed / total) * (req.storage === "LOCAL" ? 100 : 70));
            }
            return true;
          },
        },
        entries,
      );
      const hasher = new Transform({
        transform(chunk: Buffer, _enc, cb) {
          hash.update(chunk);
          cb(null, chunk);
        },
      });
      await pipeline(stream, hasher, fs.createWriteStream(target));
      const { size } = await fsp.stat(target);
      if (req.storage === "S3") {
        if (!req.s3) throw new Error("Missing S3 configuration");
        await s3.uploadFile(req.s3, s3.objectKey(req.s3, serverId, req.backupId), target, size, (pct) => progress(70 + pct * 0.3));
        await fsp.rm(target, { force: true });
      } else if (req.storage === "SFTP") {
        if (!req.sftp) throw new Error("Missing SFTP configuration");
        await sftp.uploadFile(req.sftp, sftp.remotePath(req.sftp, serverId, req.backupId), target, size, (pct) => progress(70 + pct * 0.3));
        await fsp.rm(target, { force: true });
      }
      hub.system(serverId, `Backup ${req.backupId} completed`);
      return { sizeBytes: size, checksum: hash.digest("hex") };
    } catch (err) {
      await fsp.rm(target, { force: true }).catch(() => undefined);
      hub.system(serverId, `Backup ${req.backupId} failed: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  });
}

export async function restoreBackup(serverId: string, backupId: string, location: BackupLocation) {
  const state = await getState(serverId);
  if (state !== "offline" && state !== "missing") throw conflict("Stop the server before restoring a backup");
  const root = serverRoot(serverId);
  return startOperation(`restore-${backupId}`, "restore", async (progress) => {
    let file = localPath(serverId, backupId);
    let temp = false;
    if (location.storage !== "LOCAL") {
      const { body, size } = await remoteStream(serverId, backupId, location);
      file = path.join(config.dirs.tmp, `restore-${backupId}.tar.gz`);
      temp = true;
      let got = 0;
      await pipeline(body, counter((n) => size && progress(((got += n) / size) * 40)), fs.createWriteStream(file));
    } else if (!fs.existsSync(file)) {
      throw notFound("Backup archive");
    }
    try {
      const { size } = await fsp.stat(file);
      hub.system(serverId, "Restoring backup, existing files will be replaced…");
      const staging = path.join(config.dirs.tmp, `restore-${backupId}-${Date.now()}`);
      await fsp.mkdir(staging, { recursive: true });
      let read = 0;
      const base = location.storage === "LOCAL" ? 0 : 40;
      await pipeline(
        fs.createReadStream(file),
        counter((n) => progress(base + ((read += n) / size) * (90 - base))),
        tar.x({
          cwd: staging,
          strict: true,
          preservePaths: false,
          preserveOwner: false,
          filter: (_p, entry) => {
            const type = (entry as { type?: string }).type;
            return type !== "SymbolicLink" && type !== "Link";
          },
        }),
      );
      for (const name of await fsp.readdir(root)) await fsp.rm(path.join(root, name), { recursive: true, force: true });
      for (const name of await fsp.readdir(staging)) await fsp.rename(path.join(staging, name), path.join(root, name));
      await fsp.rm(staging, { recursive: true, force: true });
      await repairOwnership(serverId);
      invalidateUsage(serverId);
      hub.system(serverId, "Backup restored");
      return {};
    } finally {
      if (temp) await fsp.rm(file, { force: true }).catch(() => undefined);
    }
  });
}

function remoteStream(serverId: string, backupId: string, location: BackupLocation) {
  if (location.storage === "SFTP") {
    if (!location.sftp) throw new Error("Missing SFTP configuration");
    return sftp.downloadStream(location.sftp, sftp.remotePath(location.sftp, serverId, backupId));
  }
  if (!location.s3) throw new Error("Missing S3 configuration");
  return s3.downloadStream(location.s3, s3.objectKey(location.s3, serverId, backupId));
}

export async function backupStream(serverId: string, backupId: string, location: BackupLocation) {
  if (location.storage !== "LOCAL") return remoteStream(serverId, backupId, location);
  const file = localPath(serverId, backupId);
  const stat = await fsp.stat(file).catch(() => null);
  if (!stat) throw notFound("Backup archive");
  return { body: fs.createReadStream(file), size: stat.size };
}

export async function deleteBackup(serverId: string, backupId: string, location: BackupLocation) {
  if (location.storage === "S3") {
    if (!location.s3) throw new Error("Missing S3 configuration");
    await s3.deleteObject(location.s3, s3.objectKey(location.s3, serverId, backupId));
  } else if (location.storage === "SFTP") {
    if (!location.sftp) throw new Error("Missing SFTP configuration");
    await sftp.deleteFile(location.sftp, sftp.remotePath(location.sftp, serverId, backupId));
  } else {
    await fsp.rm(localPath(serverId, backupId), { force: true });
  }
}
