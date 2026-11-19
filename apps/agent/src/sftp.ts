import fs from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Client, type SFTPWrapper } from "ssh2";
import type { SftpConfig } from "@loadstone/shared";

export function remotePath(cfg: SftpConfig, serverId: string, backupId: string) {
  return path.posix.join(cfg.path, serverId, `${backupId}.tar.gz`);
}

/** Opens an SSH connection with password or private-key auth and returns its SFTP session. */
function connect(cfg: SftpConfig): Promise<{ sftp: SFTPWrapper; close: () => void }> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn
      .on("ready", () => {
        conn.sftp((err, sftp) => {
          if (err) {
            conn.end();
            return reject(err);
          }
          resolve({ sftp, close: () => conn.end() });
        });
      })
      .on("error", (err) => reject(new Error(`SFTP connection to ${cfg.host}:${cfg.port} failed: ${err.message}`)))
      .connect({
        host: cfg.host,
        port: cfg.port,
        username: cfg.username,
        password: cfg.password || undefined,
        privateKey: cfg.privateKey || undefined,
        passphrase: cfg.passphrase || undefined,
        readyTimeout: 20_000,
        keepaliveInterval: 15_000,
      });
  });
}

function mkdirp(sftp: SFTPWrapper, dir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.stat(dir, (statErr) => {
      if (!statErr) return resolve();
      const parent = path.posix.dirname(dir);
      const create = () => sftp.mkdir(dir, (err) => (err && (err as { code?: number }).code !== 4 ? reject(err) : resolve()));
      if (parent === dir) return create();
      mkdirp(sftp, parent).then(create, reject);
    });
  });
}

export async function uploadFile(cfg: SftpConfig, remote: string, file: string, size: number, onProgress: (pct: number) => void) {
  const { sftp, close } = await connect(cfg);
  try {
    await mkdirp(sftp, path.posix.dirname(remote));
    const partial = `${remote}.partial`;
    let sent = 0;
    const source = fs.createReadStream(file);
    source.on("data", (chunk) => {
      sent += chunk.length;
      onProgress(size ? (sent / size) * 100 : 100);
    });
    await pipeline(source, sftp.createWriteStream(partial));
    await new Promise<void>((resolve, reject) => sftp.unlink(remote, () => sftp.rename(partial, remote, (err) => (err ? reject(err) : resolve()))));
  } finally {
    close();
  }
}

export async function downloadStream(cfg: SftpConfig, remote: string): Promise<{ body: Readable; size?: number }> {
  const { sftp, close } = await connect(cfg);
  try {
    const size = await new Promise<number>((resolve, reject) => sftp.stat(remote, (err, stats) => (err ? reject(new Error(`Backup not found on the SFTP server (${remote})`)) : resolve(stats.size))));
    const body = sftp.createReadStream(remote);
    body.on("close", close);
    body.on("error", close);
    return { body, size };
  } catch (err) {
    close();
    throw err;
  }
}

export async function deleteFile(cfg: SftpConfig, remote: string) {
  const { sftp, close } = await connect(cfg);
  try {
    await new Promise<void>((resolve, reject) => sftp.unlink(remote, (err) => (err && (err as { code?: number }).code !== 2 ? reject(err) : resolve())));
  } finally {
    close();
  }
}

/** Connects, writes and deletes a small probe file, so the settings page can verify the configuration. */
export async function testConnection(cfg: SftpConfig) {
  const { sftp, close } = await connect(cfg);
  try {
    await mkdirp(sftp, cfg.path);
    const probe = path.posix.join(cfg.path, `.loadstone-probe-${Date.now()}`);
    await new Promise<void>((resolve, reject) => sftp.writeFile(probe, "ok", (err) => (err ? reject(err) : resolve())));
    await new Promise<void>((resolve) => sftp.unlink(probe, () => resolve()));
  } finally {
    close();
  }
}
