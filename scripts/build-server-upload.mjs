#!/usr/bin/env node
// Regenerates SERVER_UPLOAD/: exactly the files needed to build and run Loadstone with Docker on a server.
// Usage: npm run server-bundle

import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = "SERVER_UPLOAD";
const OUT_DIR = join(ROOT, OUT);
const DEPLOY_DIR = join(ROOT, "deploy");
const MANIFEST = ".bundle-files";

const EXCLUDED_PREFIXES = [`${OUT}/`, "scripts/", "tests/", "backups/", "deploy/", "registry-deploy/", ".devin/", ".git/", ".github/", "docs/", "docker-hub/"];
// Build output, dependencies and local agent data, at any depth.
const EXCLUDED_SEGMENTS = new Set(["node_modules", ".next", "dist", ".turbo", ".data"]);
const EXCLUDED_FILES = new Set(["AGENTS.md", "CLAUDE.md", "README.md", "CONTRIBUTING.md", "SECURITY.md", ".gitignore", ".gitattributes", ".env.example", "docker-compose.dev.yml"]);
// Gitignored (or easily ignored) files that only contain placeholders but are needed on the server.
const EXTRA_FILES = [".env.docker.example"];
const REQUIRED = ["docker-compose.yml", "apps/panel/Dockerfile", "apps/agent/Dockerfile", "apps/panel/docker-entrypoint.sh", "package-lock.json", "update.sh"];

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

function git(args) {
  try {
    return execFileSync("git", args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 });
  } catch (err) {
    if (err.code === "ENOENT") fail("git is required to collect the file list, but it is not installed or not on PATH.");
    throw err;
  }
}

function isRepo() {
  try {
    return git(["rev-parse", "--show-toplevel"]).toString().trim().length > 0;
  } catch {
    return false;
  }
}

// Tracked files plus untracked files that aren't gitignored. Outside a git repository the same
// .gitignore rules are applied through a throwaway git directory.
function listProjectFiles() {
  let out;
  if (isRepo()) {
    out = git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]);
  } else {
    const tmp = mkdtempSync(join(tmpdir(), "server-bundle-"));
    try {
      git(["init", "-q", tmp]);
      out = git([`--git-dir=${join(tmp, ".git")}`, `--work-tree=${ROOT}`, "ls-files", "--others", "--exclude-standard", "-z"]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
  return out.toString("utf8").split("\0").filter(Boolean);
}

function isExcluded(path) {
  if (EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  if (EXCLUDED_FILES.has(path)) return true;
  if (path.split("/").some((segment) => EXCLUDED_SEGMENTS.has(segment))) return true;
  const base = path.slice(path.lastIndexOf("/") + 1);
  return /^\.env(\.|$)/.test(base) && !base.endsWith(".example");
}

const files = new Map();
for (const path of listProjectFiles()) {
  const source = join(ROOT, path);
  if (!isExcluded(path) && existsSync(source) && statSync(source).isFile()) files.set(path, source);
}
for (const path of EXTRA_FILES) {
  const source = join(ROOT, path);
  if (!existsSync(source)) fail(`${path} is missing.`);
  files.set(path, source);
}
if (!existsSync(DEPLOY_DIR)) fail("deploy/ is missing (it holds update.sh and DEPLOY.md).");
for (const name of readdirSync(DEPLOY_DIR)) {
  const source = join(DEPLOY_DIR, name);
  if (statSync(source).isFile()) files.set(name, source);
}

const missing = REQUIRED.filter((path) => !files.has(path));
if (missing.length) fail(`Required files are missing from the bundle: ${missing.join(", ")}`);

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const paths = [...files.keys(), MANIFEST].sort();
for (const path of paths) {
  if (path === MANIFEST) continue;
  const source = files.get(path);
  const target = join(OUT_DIR, path);
  mkdirSync(dirname(target), { recursive: true });
  if (path.endsWith(".sh")) {
    writeFileSync(target, readFileSync(source, "utf8").replace(/\r\n?/g, "\n"));
    chmodSync(target, 0o755);
  } else {
    copyFileSync(source, target);
  }
}
writeFileSync(join(OUT_DIR, MANIFEST), `${paths.join("\n")}\n`);

console.log(`✔ ${OUT} rebuilt with ${paths.length} files`);
console.log(`  Next: upload everything in ${OUT}/ (including hidden files) over the previous upload on the server,`);
console.log("  then run `sh update.sh` there. First install: cp .env.docker.example .env.docker and fill it in. See DEPLOY.md.");
