import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { AGENT_VERSION, ALLOWED_DOWNLOAD_HOSTS, type PluginInstall } from "@loadstone/shared";
import { HttpError, quotaExceeded } from "./errors.js";
import { invalidateUsage, resolveSafe, serverRoot } from "./paths.js";
import { giveToServer } from "./ownership.js";
import { remainingQuota } from "./files.js";

const MAX_PLUGIN_BYTES = 256 * 1024 * 1024;

function assertAllowed(url: string) {
  const u = new URL(url);
  if (u.protocol !== "https:" || !(ALLOWED_DOWNLOAD_HOSTS as readonly string[]).includes(u.hostname)) {
    throw new HttpError(422, `Downloads from ${u.hostname} are not allowed`);
  }
}

async function fetchAllowed(url: string, redirects = 5): Promise<Response> {
  assertAllowed(url);
  const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(120_000), headers: { "user-agent": `loadstone-agent/${AGENT_VERSION}` } });
  if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
    if (redirects <= 0) throw new HttpError(502, "Too many redirects");
    return fetchAllowed(new URL(res.headers.get("location")!, url).toString(), redirects - 1);
  }
  if (!res.ok || !res.body) throw new HttpError(502, `Download failed with status ${res.status}`);
  return res;
}

export async function installPlugin(serverId: string, input: PluginInstall) {
  const root = serverRoot(serverId);
  const dir = await resolveSafe(root, `/${input.directory}`);
  await fsp.mkdir(dir, { recursive: true });
  const target = await resolveSafe(root, `/${input.directory}/${input.fileName}`);
  const res = await fetchAllowed(input.url);
  const limit = Math.min(MAX_PLUGIN_BYTES, await remainingQuota(serverId));
  const sha512 = createHash("sha512");
  const sha256 = createHash("sha256");
  let size = 0;
  const tmp = `${target}.download`;
  try {
    await pipeline(
      Readable.fromWeb(res.body as import("node:stream/web").ReadableStream),
      new Transform({
        transform(chunk: Buffer, _e, cb) {
          size += chunk.length;
          if (size > limit) return cb(size > MAX_PLUGIN_BYTES ? new HttpError(413, "Plugin file is too large") : quotaExceeded());
          sha512.update(chunk);
          sha256.update(chunk);
          cb(null, chunk);
        },
      }),
      fs.createWriteStream(tmp),
    );
    if (input.sha512 && sha512.digest("hex") !== input.sha512) throw new HttpError(422, "Checksum mismatch (sha512)");
    if (input.sha256 && sha256.digest("hex") !== input.sha256) throw new HttpError(422, "Checksum mismatch (sha256)");
    if (input.replaces) {
      const old = await resolveSafe(root, `/${input.directory}/${input.replaces}`);
      await fsp.rm(old, { force: true });
      await fsp.rm(`${old}.disabled`, { force: true });
    }
    await fsp.rename(tmp, target);
    await giveToServer(serverId, target);
  } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  } finally {
    invalidateUsage(serverId);
  }
  return { fileName: path.basename(target), size };
}
