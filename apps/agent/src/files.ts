import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { PassThrough, Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { FileEntry } from "@loadstone/shared";
import { config } from "./config.js";
import { HttpError, isErrno, notFound, quotaExceeded } from "./errors.js";
import { invalidateUsage, relativeTo, resolveSafe, serverRoot, serverUsage } from "./paths.js";
import { loadSpec } from "./docker.js";
import { extractArchive, zipTo } from "./archive.js";
import { giveToServer } from "./ownership.js";

const TEXT_EXT = new Set([
  "txt", "log", "yml", "yaml", "json", "json5", "properties", "toml", "conf", "cfg", "ini", "md", "sh", "bat", "js", "ts",
  "xml", "html", "css", "csv", "mcmeta", "sk", "lang", "py", "lua", "env", "secret", "mcfunction", "snbt", "",
]);
const MAX_EDIT_BYTES = 5 * 1024 * 1024;

function isEditable(name: string, size: number) {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return size <= MAX_EDIT_BYTES && TEXT_EXT.has(ext);
}

/** Server jars in the server root (paper-*.jar, server.jar, …) are managed by Loadstone: hidden and read-only for users. */
const isServerJar = (r: string, abs: string) => path.dirname(abs) === r && abs.toLowerCase().endsWith(".jar");

function assertNotServerJar(r: string, ...targets: string[]) {
  if (targets.some((t) => isServerJar(r, t))) throw new HttpError(403, "Server jars are managed by Loadstone and cannot be changed or replaced");
}

/** Runs fn (an extraction into the root) without letting it replace or add server jars. */
async function protectRootJars(r: string, fn: () => Promise<void>) {
  const jars = (await fsp.readdir(r)).filter((n) => n.toLowerCase().endsWith(".jar"));
  const stash = path.join(config.dirs.tmp, `jars-${randomUUID().slice(0, 8)}`);
  await fsp.mkdir(stash, { recursive: true });
  for (const jar of jars) await fsp.rename(path.join(r, jar), path.join(stash, jar));
  try {
    await fn();
  } finally {
    for (const name of await fsp.readdir(r)) {
      if (name.toLowerCase().endsWith(".jar")) await fsp.rm(path.join(r, name), { recursive: true, force: true });
    }
    for (const jar of jars) await fsp.rename(path.join(stash, jar), path.join(r, jar));
    await fsp.rm(stash, { recursive: true, force: true });
  }
}

async function root(serverId: string) {
  const r = serverRoot(serverId);
  await fsp.mkdir(r, { recursive: true });
  return r;
}

export async function remainingQuota(serverId: string): Promise<number> {
  const spec = await loadSpec(serverId);
  if (!spec || spec.diskMb <= 0) return Number.MAX_SAFE_INTEGER;
  return spec.diskMb * 1024 * 1024 - (await serverUsage(serverId, 5000));
}

export async function list(serverId: string, userPath: string): Promise<FileEntry[]> {
  const r = await root(serverId);
  const dir = await resolveSafe(r, userPath);
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (isErrno(err, "ENOENT")) throw notFound("Directory");
    if (isErrno(err, "ENOTDIR")) throw new HttpError(400, "Not a directory");
    throw err;
  }
  const out = await Promise.all(
    entries.map(async (e) => {
      const abs = path.join(dir, e.name);
      if (isServerJar(r, abs)) return null;
      const stat = await fsp.lstat(abs).catch(() => null);
      if (!stat) return null;
      const type: FileEntry["type"] = stat.isSymbolicLink() ? "symlink" : stat.isDirectory() ? "directory" : "file";
      return {
        name: e.name,
        path: relativeTo(r, abs),
        type,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        editable: type === "file" && isEditable(e.name, stat.size),
      } satisfies FileEntry;
    }),
  );
  return out.filter((e): e is FileEntry => e !== null);
}

export async function readText(serverId: string, userPath: string) {
  const r = await root(serverId);
  const file = await resolveSafe(r, userPath);
  if (isServerJar(r, file)) throw notFound("File");
  const stat = await fsp.stat(file).catch(() => null);
  if (!stat?.isFile()) throw notFound("File");
  if (stat.size > MAX_EDIT_BYTES) throw new HttpError(413, "File is too large to edit in the browser (5 MB max)");
  const buf = await fsp.readFile(file);
  if (buf.subarray(0, 8000).includes(0)) throw new HttpError(415, "Binary files cannot be edited");
  return { content: buf.toString("utf8"), size: stat.size };
}

async function atomicWrite(target: string, writer: (tmp: string) => Promise<void>) {
  await fsp.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.loadstone-${randomUUID().slice(0, 8)}.tmp`;
  try {
    await writer(tmp);
    await fsp.rename(tmp, target);
  } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
}

export async function writeText(serverId: string, userPath: string, content: string) {
  const r = await root(serverId);
  const file = await resolveSafe(r, userPath);
  assertNotServerJar(r, file);
  const bytes = Buffer.byteLength(content);
  const existing = (await fsp.stat(file).catch(() => null))?.size ?? 0;
  if (bytes - existing > (await remainingQuota(serverId))) throw quotaExceeded();
  await atomicWrite(file, (tmp) => fsp.writeFile(tmp, content, "utf8"));
  await giveToServer(serverId, file);
  invalidateUsage(serverId);
}

export async function upload(serverId: string, userPath: string, body: Readable) {
  const r = await root(serverId);
  const file = await resolveSafe(r, userPath);
  if (file === r) throw new HttpError(400, "Invalid upload path");
  assertNotServerJar(r, file);
  const limit = Math.min(await remainingQuota(serverId), config.maxUploadBytes);
  let received = 0;
  const guard = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      received += chunk.length;
      if (received > limit) return cb(received > config.maxUploadBytes ? new HttpError(413, "Upload exceeds the maximum size") : quotaExceeded());
      cb(null, chunk);
    },
  });
  await atomicWrite(file, (tmp) => pipeline(body, guard, fs.createWriteStream(tmp)));
  await giveToServer(serverId, file);
  invalidateUsage(serverId);
  return { size: received };
}

export async function mkdir(serverId: string, userPath: string) {
  const dir = await resolveSafe(await root(serverId), userPath);
  await fsp.mkdir(dir, { recursive: true });
  await giveToServer(serverId, dir);
}

export async function rename(serverId: string, from: string, to: string) {
  const r = await root(serverId);
  const src = await resolveSafe(r, from);
  const dst = await resolveSafe(r, to);
  if (src === r || dst === r) throw new HttpError(400, "Cannot move the server root");
  assertNotServerJar(r, src, dst);
  if (!(await fsp.lstat(src).catch(() => null))) throw notFound("Source");
  if (await fsp.lstat(dst).catch(() => null)) throw new HttpError(409, "Destination already exists");
  await fsp.mkdir(path.dirname(dst), { recursive: true });
  await fsp.rename(src, dst);
  await giveToServer(serverId, dst);
}

export async function remove(serverId: string, paths: string[]) {
  const r = await root(serverId);
  for (const p of paths) {
    const target = await resolveSafe(r, p);
    if (target === r) throw new HttpError(400, "Cannot delete the server root");
    assertNotServerJar(r, target);
    await fsp.rm(target, { recursive: true, force: true });
  }
  invalidateUsage(serverId);
}

export async function download(serverId: string, userPath: string) {
  const r = await root(serverId);
  const target = await resolveSafe(r, userPath);
  const stat = isServerJar(r, target) ? null : await fsp.stat(target).catch(() => null);
  if (!stat) throw notFound("File");
  if (stat.isDirectory()) {
    const out = new PassThrough();
    void zipTo(out, path.dirname(target), [target]).catch((err: unknown) => out.destroy(err as Error));
    return { stream: out as Readable, name: `${path.basename(target) || "server"}.zip`, size: undefined };
  }
  return { stream: fs.createReadStream(target) as Readable, name: path.basename(target), size: stat.size };
}

export async function extract(serverId: string, userPath: string, destination?: string) {
  const r = await root(serverId);
  const file = await resolveSafe(r, userPath);
  const dest = await resolveSafe(r, destination ?? path.posix.dirname(userPath.replace(/\\/g, "/")));
  if (isServerJar(r, file) || !(await fsp.stat(file).catch(() => null))?.isFile()) throw notFound("Archive");
  const quota = await remainingQuota(serverId);
  if (dest === r) await protectRootJars(r, () => extractArchive(file, dest, quota));
  else await extractArchive(file, dest, quota);
  await giveToServer(serverId, dest);
  invalidateUsage(serverId);
}

export async function compress(serverId: string, paths: string[], destination: string) {
  const r = await root(serverId);
  const sources = await Promise.all(paths.map((p) => resolveSafe(r, p)));
  const dest = await resolveSafe(r, destination);
  if (!dest.toLowerCase().endsWith(".zip")) throw new HttpError(400, "Destination must be a .zip file");
  assertNotServerJar(r, ...sources);
  const base = path.dirname(sources[0]!);
  await atomicWrite(dest, (tmp) => zipTo(fs.createWriteStream(tmp), base, sources));
  await giveToServer(serverId, dest);
  invalidateUsage(serverId);
  if ((await remainingQuota(serverId)) < 0) {
    await fsp.rm(dest, { force: true });
    invalidateUsage(serverId);
    throw quotaExceeded();
  }
}

export async function cleanup(serverId: string, days: number) {
  const r = await root(serverId);
  const cutoff = Date.now() - days * 86400_000;
  let removed = 0;
  for (const dir of ["logs", "crash-reports"]) {
    const abs = path.join(r, dir);
    const entries = await fsp.readdir(abs, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (!e.isFile() || e.name === "latest.log") continue;
      const p = path.join(abs, e.name);
      const stat = await fsp.stat(p).catch(() => null);
      if (stat && stat.mtimeMs < cutoff) {
        await fsp.rm(p, { force: true });
        removed++;
      }
    }
  }
  invalidateUsage(serverId);
  return { removed };
}
