export type JvmPresetId = "aikar" | "velocity" | "zgc" | "shenandoah" | "compact";

export interface JvmPreset {
  id: JvmPresetId;
  label: string;
  description: string;
  minJava?: number;
  proxyOnly?: boolean;
}

export const JVM_PRESETS: JvmPreset[] = [
  {
    id: "aikar",
    label: "Aikar's flags",
    description: "Tuned G1GC that the Paper team recommends for most servers. Uses larger heap regions automatically above 12 GB.",
  },
  {
    id: "zgc",
    label: "Generational ZGC",
    description: "Sub-millisecond GC pauses for large heaps (16 GB+). Needs Java 21+ and spare CPU cores.",
    minJava: 21,
  },
  {
    id: "shenandoah",
    label: "Shenandoah",
    description: "Low-pause concurrent GC. A good middle ground on mid-sized heaps.",
    minJava: 17,
  },
  {
    id: "compact",
    label: "Aikar's + compact headers",
    description: "Aikar's flags plus compact object headers, which cut memory use by roughly 10–20%. Needs Java 25+.",
    minJava: 25,
  },
  {
    id: "velocity",
    label: "Velocity proxy",
    description: "The flags Velocity recommends for proxies.",
    proxyOnly: true,
  },
];

function aikar(memoryMb: number) {
  const large = memoryMb >= 12 * 1024;
  return [
    "-XX:+UseG1GC",
    "-XX:+ParallelRefProcEnabled",
    "-XX:MaxGCPauseMillis=200",
    "-XX:+UnlockExperimentalVMOptions",
    "-XX:+DisableExplicitGC",
    "-XX:+AlwaysPreTouch",
    `-XX:G1NewSizePercent=${large ? 40 : 30}`,
    `-XX:G1MaxNewSizePercent=${large ? 50 : 40}`,
    `-XX:G1HeapRegionSize=${large ? "16M" : "8M"}`,
    `-XX:G1ReservePercent=${large ? 15 : 20}`,
    "-XX:G1HeapWastePercent=5",
    "-XX:G1MixedGCCountTarget=4",
    `-XX:InitiatingHeapOccupancyPercent=${large ? 20 : 15}`,
    "-XX:G1MixedGCLiveThresholdPercent=90",
    "-XX:G1RSetUpdatingPauseTimePercent=5",
    "-XX:SurvivorRatio=32",
    "-XX:+PerfDisableSharedMem",
    "-XX:MaxTenuringThreshold=1",
    "-Dusing.aikars.flags=https://mcflags.emc.gs",
    "-Daikars.new.flags=true",
  ];
}

export function jvmFlagsFor(preset: JvmPresetId, opts: { memoryMb: number; javaVersion: string }): string {
  const java = Number(opts.javaVersion) || 21;
  switch (preset) {
    case "aikar":
      return aikar(opts.memoryMb).join(" ");
    case "compact":
      return [...aikar(opts.memoryMb), "-XX:+UseCompactObjectHeaders"].join(" ");
    case "zgc":
      return ["-XX:+UseZGC", ...(java < 24 ? ["-XX:+ZGenerational"] : []), "-XX:+AlwaysPreTouch", "-XX:+DisableExplicitGC", "-XX:+PerfDisableSharedMem"].join(" ");
    case "shenandoah":
      return ["-XX:+UseShenandoahGC", "-XX:+AlwaysPreTouch", "-XX:+DisableExplicitGC", "-XX:+PerfDisableSharedMem", "-XX:+UseStringDeduplication"].join(" ");
    case "velocity":
      return ["-XX:+UseG1GC", "-XX:G1HeapRegionSize=4M", "-XX:+UnlockExperimentalVMOptions", "-XX:+ParallelRefProcEnabled", "-XX:+AlwaysPreTouch", "-XX:MaxInlineLevel=15"].join(" ");
  }
}

export function presetsFor(opts: { javaVersion: string; proxy: boolean }): (JvmPreset & { available: boolean; reason?: string })[] {
  const java = Number(opts.javaVersion) || 21;
  return JVM_PRESETS.filter((p) => (opts.proxy ? p.proxyOnly || p.id === "aikar" : !p.proxyOnly)).map((p) => {
    const tooOld = p.minJava !== undefined && java < p.minJava;
    return { ...p, available: !tooOld, reason: tooOld ? `Requires Java ${p.minJava}+` : undefined };
  });
}

export function detectPreset(flags: string, opts: { memoryMb: number; javaVersion: string }): JvmPresetId | null {
  const normalized = flags.trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  for (const p of JVM_PRESETS) if (jvmFlagsFor(p.id, opts) === normalized) return p.id;
  return null;
}
