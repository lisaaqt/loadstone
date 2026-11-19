import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Writable } from "node:stream";
import { ZipArchive } from "archiver";
import yauzl from "yauzl";
import * as tar from "tar";
import { HttpError } from "./errors.js";
import { resolveSafe } from "./paths.js";

/** Streams a zip of the given absolute paths (files or directories) into `output`. */
export async function zipTo(output: Writable, root: string, absPaths: string[]) {
  const archive = new ZipArchive({ zlib: { level: 6 } });
  const done = new Promise<void>((resolve, reject) => {
    output.on("close", resolve);
    output.on("finish", resolve);
    archive.on("error", reject);
    output.on("error", reject);
  });
  archive.pipe(output);
  for (const abs of absPaths) {
    const stat = await fsp.lstat(abs);
    const name = path.relative(root, abs).split(path.sep).join("/") || path.basename(abs);
    if (stat.isDirectory()) archive.directory(abs, name);
    else if (stat.isFile()) archive.file(abs, { name });
  }
  await archive.finalize();
  await done;
}

function openZip(file: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) =>
    yauzl.open(file, { lazyEntries: true, autoClose: true, strictFileNames: false, validateEntrySizes: true }, (err, zip) => (err || !zip ? reject(err ?? new Error("Invalid zip")) : resolve(zip))),
  );
}

const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;

/** Extracts a zip archive into `dest`, rejecting path traversal, symlinks and zip bombs. */
export async function extractZip(file: string, dest: string, maxBytes: number) {
  const zip = await openZip(file);
  let total = 0;
  let entries = 0;
  await new Promise<void>((resolve, reject) => {
    zip.on("error", reject);
    zip.on("end", resolve);
    zip.on("entry", (entry: yauzl.Entry) => {
      void (async () => {
        entries++;
        if (entries > 200_000) throw new HttpError(422, "Archive contains too many entries");
        const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
        if ((mode & S_IFMT) === S_IFLNK) return zip.readEntry();
        const target = await resolveSafe(dest, entry.fileName);
        if (/\/$/.test(entry.fileName)) {
          await fsp.mkdir(target, { recursive: true });
          return zip.readEntry();
        }
        total += entry.uncompressedSize;
        if (total > maxBytes) throw new HttpError(507, "Extracting this archive would exceed the storage quota");
        await fsp.mkdir(path.dirname(target), { recursive: true });
        const stream = await new Promise<NodeJS.ReadableStream>((res, rej) => zip.openReadStream(entry, (err, s) => (err || !s ? rej(err) : res(s))));
        await pipeline(stream, fs.createWriteStream(target));
        zip.readEntry();
      })().catch((err: unknown) => {
        zip.close();
        reject(err);
      });
    });
    zip.readEntry();
  });
}

export async function extractTar(file: string, dest: string, gzip: boolean) {
  await fsp.mkdir(dest, { recursive: true });
  await tar.x({
    file,
    cwd: dest,
    gzip,
    strict: true,
    preservePaths: false,
    preserveOwner: false,
    filter: (_p, entry) => {
      const type = (entry as { type?: string }).type;
      return type !== "SymbolicLink" && type !== "Link";
    },
  });
}

export async function extractArchive(file: string, dest: string, maxBytes: number) {
  const lower = file.toLowerCase();
  if (lower.endsWith(".zip")) return extractZip(file, dest, maxBytes);
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) return extractTar(file, dest, true);
  if (lower.endsWith(".tar")) return extractTar(file, dest, false);
  throw new HttpError(422, "Unsupported archive format (zip, tar, tar.gz)");
}
