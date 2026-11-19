import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { PassThrough, type Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import type { WorldInfo } from "@loadstone/shared";
import { config } from "./config.js";
import { HttpError, notFound } from "./errors.js";
import { dirSize, invalidateUsage, serverRoot } from "./paths.js";
import { giveToServer } from "./ownership.js";
import { extractZip, zipTo } from "./archive.js";
import { remainingQuota, upload } from "./files.js";

const NAME = /^[A-Za-z0-9_\-. ]{1,64}$/;

function worldDir(serverId: string, name: string) {
  if (!NAME.test(name) || name === "." || name === "..") throw new HttpError(400, "Invalid world name");
  return path.join(serverRoot(serverId), name);
}

async function readLevelName(serverId: string) {
  const props = await fsp.readFile(path.join(serverRoot(serverId), "server.properties"), "utf8").catch(() => "");
  const line = props.split(/\r?\n/).find((l) => l.trim().startsWith("level-name="));
  return line ? line.split("=").slice(1).join("=").trim() || "world" : "world";
}

export async function listWorlds(serverId: string): Promise<{ worlds: WorldInfo[]; active: string }> {
  const root = serverRoot(serverId);
  const entries = await fsp.readdir(root, { withFileTypes: true }).catch(() => []);
  const worlds: WorldInfo[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = path.join(root, e.name);
    const level = await fsp.stat(path.join(dir, "level.dat")).catch(() => null);
    if (!level) continue;
    const dims = ["overworld"];
    if (fs.existsSync(path.join(dir, "DIM-1"))) dims.push("nether");
    if (fs.existsSync(path.join(dir, "DIM1"))) dims.push("end");
    worlds.push({ name: e.name, sizeBytes: await dirSize(dir), modifiedAt: level.mtime.toISOString(), dimensions: dims });
  }
  return { worlds: worlds.sort((a, b) => a.name.localeCompare(b.name)), active: await readLevelName(serverId) };
}

export async function setActiveWorld(serverId: string, name: string) {
  worldDir(serverId, name);
  const file = path.join(serverRoot(serverId), "server.properties");
  const props = await fsp.readFile(file, "utf8").catch(() => "");
  const lines = props.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.trim().startsWith("level-name="));
  if (idx >= 0) lines[idx] = `level-name=${name}`;
  else lines.push(`level-name=${name}`);
  await fsp.writeFile(file, `${lines.filter((l, i) => l !== "" || i < lines.length - 1).join("\n")}\n`);
  await giveToServer(serverId, file);
}

export async function deleteWorld(serverId: string, name: string) {
  const dir = worldDir(serverId, name);
  if (!fs.existsSync(path.join(dir, "level.dat"))) throw notFound("World");
  await fsp.rm(dir, { recursive: true, force: true });
  invalidateUsage(serverId);
}

export function exportWorld(serverId: string, name: string): Readable {
  const dir = worldDir(serverId, name);
  if (!fs.existsSync(path.join(dir, "level.dat"))) throw notFound("World");
  const out = new PassThrough();
  void zipTo(out, path.dirname(dir), [dir]).catch((err: unknown) => out.destroy(err as Error));
  return out;
}

async function findLevelRoot(dir: string, depth = 0): Promise<string | null> {
  if (fs.existsSync(path.join(dir, "level.dat"))) return dir;
  if (depth >= 2) return null;
  const subdirs = (await fsp.readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory() && e.name !== "__MACOSX");
  for (const s of subdirs) {
    const found = await findLevelRoot(path.join(dir, s.name), depth + 1);
    if (found) return found;
  }
  return null;
}

export async function importWorld(serverId: string, name: string, body: Readable) {
  const target = worldDir(serverId, name);
  if (fs.existsSync(target)) throw new HttpError(409, `A folder named ${name} already exists`);
  const id = randomUUID();
  const tmpZip = `/.loadstone/import-${id}.zip`;
  const staging = path.join(config.dirs.tmp, `world-${id}`);
  const zipAbs = path.join(serverRoot(serverId), tmpZip);
  try {
    await upload(serverId, tmpZip, body);
    await fsp.mkdir(staging, { recursive: true });
    await extractZip(zipAbs, staging, await remainingQuota(serverId));
    const levelRoot = await findLevelRoot(staging);
    if (!levelRoot) throw new HttpError(422, "The archive does not contain a level.dat");
    await fsp.rename(levelRoot, target).catch(async () => {
      await fsp.cp(levelRoot, target, { recursive: true });
    });
    await giveToServer(serverId, target);
  } finally {
    await fsp.rm(zipAbs, { force: true }).catch(() => undefined);
    await fsp.rm(staging, { recursive: true, force: true }).catch(() => undefined);
    invalidateUsage(serverId);
  }
}
