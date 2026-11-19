import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { HttpError, isErrno } from "./errors.js";

const ID = /^[a-z0-9]{8,40}$/;

export function assertId(id: string, what = "id"): string {
  if (!ID.test(id)) throw new HttpError(400, `Invalid ${what}`);
  return id;
}

export function serverRoot(serverId: string) {
  return path.join(config.dirs.servers, assertId(serverId, "server id"));
}

export function hostServerRoot(serverId: string) {
  return path.join(config.hostDataDir, "servers", assertId(serverId, "server id"));
}

function within(root: string, target: string) {
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

async function nearestExisting(p: string): Promise<string> {
  let current = p;
  for (;;) {
    try {
      return await fs.realpath(current);
    } catch (err) {
      if (!isErrno(err, "ENOENT")) throw err;
      const parent = path.dirname(current);
      if (parent === current) return current;
      current = parent;
    }
  }
}

/**
 * Resolves a user-supplied path inside a root directory and guarantees the result
 * (including symlink targets of existing ancestors) cannot escape the root.
 */
export async function resolveSafe(root: string, userPath: string): Promise<string> {
  if (userPath.includes("\0")) throw new HttpError(400, "Invalid path");
  const normalized = path.posix.normalize(`/${userPath.replace(/\\/g, "/")}`);
  const target = path.join(root, ...normalized.split("/").filter(Boolean));
  if (!within(root, target)) throw new HttpError(400, "Path escapes the server directory");
  const realRoot = await fs.realpath(root).catch(() => root);
  const realTarget = await nearestExisting(target);
  if (!within(realRoot, realTarget)) throw new HttpError(400, "Path escapes the server directory");
  return target;
}

export function relativeTo(root: string, abs: string) {
  const rel = path.relative(root, abs).split(path.sep).join("/");
  return `/${rel}`.replace(/\/+$/, "") || "/";
}

export async function dirSize(dir: string): Promise<number> {
  let total = 0;
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  await Promise.all(
    entries.map(async (e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) total += await dirSize(p);
      else if (e.isFile()) total += (await fs.lstat(p).catch(() => ({ size: 0 }))).size;
    }),
  );
  return total;
}

const usageCache = new Map<string, { bytes: number; at: number }>();

export async function serverUsage(serverId: string, maxAgeMs = 30_000): Promise<number> {
  const cached = usageCache.get(serverId);
  if (cached && Date.now() - cached.at < maxAgeMs) return cached.bytes;
  const bytes = await dirSize(serverRoot(serverId));
  usageCache.set(serverId, { bytes, at: Date.now() });
  return bytes;
}

export function invalidateUsage(serverId: string) {
  usageCache.delete(serverId);
}

export function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/^\/+/, "")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\u0000/g, ".*");
  return new RegExp(`^${escaped}(/.*)?$`);
}
