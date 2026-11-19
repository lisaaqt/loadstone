import rootPackage from "../../../package.json";

/** Loadstone release version. Single source of truth: "version" in the repository's root package.json. */
export const LOADSTONE_VERSION: string = rootPackage.version;
export const PANEL_VERSION = LOADSTONE_VERSION;
export const AGENT_VERSION = LOADSTONE_VERSION;

/** Compares dotted versions (1.2.10 > 1.2.9); returns <0, 0 or >0. */
export function compareVersions(a: string, b: string) {
  const pa = a.split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}
