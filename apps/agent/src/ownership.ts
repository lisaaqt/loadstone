import fsp from "node:fs/promises";
import path from "node:path";
import { serverRoot } from "./paths.js";

/** itzg/minecraft-server runs the server as UID/GID 1000 unless told otherwise (UID/GID are reserved env vars). */
const DEFAULT_OWNER = { uid: 1000, gid: 1000 };
const enabled = process.platform !== "win32" && process.getuid?.() === 0;

/** The user the server container writes files as: the owner of the server folder, or itzg's default. */
async function serverOwner(root: string) {
  const stat = await fsp.stat(root).catch(() => null);
  return stat && stat.uid !== 0 ? { uid: stat.uid, gid: stat.gid } : DEFAULT_OWNER;
}

async function chownTree(target: string, owner: { uid: number; gid: number }): Promise<void> {
  const stat = await fsp.lstat(target).catch(() => null);
  if (!stat) return;
  if (stat.uid !== owner.uid || stat.gid !== owner.gid) await fsp.lchown(target, owner.uid, owner.gid).catch(() => undefined);
  if (!stat.isDirectory()) return;
  const entries = await fsp.readdir(target).catch(() => [] as string[]);
  for (let i = 0; i < entries.length; i += 64) {
    await Promise.all(entries.slice(i, i + 64).map((name) => chownTree(path.join(target, name), owner)));
  }
}

/**
 * The agent runs as root, so files it writes would be root-owned and the Minecraft server (UID 1000) couldn't change
 * them. Gives `targets` (recursively) and any parent folders up to the server root back to the server's user.
 */
export async function giveToServer(serverId: string, ...targets: string[]) {
  if (!enabled) return;
  const root = serverRoot(serverId);
  const owner = await serverOwner(root);
  for (const target of targets) {
    for (let dir = path.dirname(target); dir.startsWith(root) && dir !== root; dir = path.dirname(dir)) {
      const stat = await fsp.lstat(dir).catch(() => null);
      if (stat && stat.uid !== owner.uid) await fsp.lchown(dir, owner.uid, owner.gid).catch(() => undefined);
    }
    await chownTree(target, owner);
  }
}

/** Repairs the whole server folder (e.g. files written by older agent versions); run before the server starts. */
export async function repairOwnership(serverId: string) {
  if (!enabled) return;
  const root = serverRoot(serverId);
  await chownTree(root, await serverOwner(root));
}
