// Bundles the custom server, worker and CLI into dist/ (dependencies stay external, workspace packages are inlined).
import { build } from "esbuild";
import { readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const external = Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies }).filter((name) => !name.startsWith("@loadstone/"));

rmSync(new URL("./dist", import.meta.url), { recursive: true, force: true });
await build({
  absWorkingDir: root,
  entryPoints: ["server.ts", "worker.ts", "cli.ts"],
  outdir: "dist",
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node22",
  sourcemap: true,
  external,
  tsconfig: "tsconfig.json",
  logLevel: "info",
});
