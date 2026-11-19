import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// monaco-editor's "exports" map hides package.json (0.53+), so look for the package folder on disk instead.
function findPackage(name) {
  for (let dir = here; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return candidate;
    if (dirname(dir) === dir) return null;
  }
}

const pkg = findPackage("monaco-editor");
if (!pkg) {
  console.warn("[copy-monaco] monaco-editor not installed, skipping");
  process.exit(0);
}

const source = join(pkg, "min", "vs");
if (!existsSync(join(source, "loader.js"))) {
  console.error(`[copy-monaco] ${source}/loader.js not found; the file editor would not load`);
  process.exit(1);
}

const target = join(here, "..", "public", "monaco", "vs");
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
console.log("[copy-monaco] copied Monaco assets to public/monaco/vs");
