export const SOFTWARE_IDS = [
  "VANILLA",
  "PAPER",
  "PURPUR",
  "SPIGOT",
  "FABRIC",
  "FORGE",
  "NEOFORGE",
  "QUILT",
  "FOLIA",
  "VELOCITY",
  "BUNGEECORD",
  "WATERFALL",
  "CUSTOM",
] as const;

/** Proxy software (players connect here and are sent on to backend servers). */
export const PROXY_IDS = ["VELOCITY", "BUNGEECORD", "WATERFALL"] as const;
export const isProxySoftware = (id: string): id is (typeof PROXY_IDS)[number] => (PROXY_IDS as readonly string[]).includes(id);

export type SoftwareId = (typeof SOFTWARE_IDS)[number];

export type AddonKind = "plugin" | "mod" | "none";

export interface SoftwareDefinition {
  id: SoftwareId;
  label: string;
  description: string;
  category: "vanilla" | "plugins" | "mods" | "proxy" | "custom";
  addonKind: AddonKind;
  addonDirectory: "plugins" | "mods" | null;
  modrinthLoaders: string[];
  hangarPlatform: "PAPER" | "VELOCITY" | "WATERFALL" | null;
  image: string | null;
  itzgType: string | null;
  internalPort: number;
  dataPath: string;
  usesMinecraftVersion: boolean;
}

const javaServer = {
  image: "itzg/minecraft-server",
  internalPort: 25565,
  dataPath: "/data",
  usesMinecraftVersion: true,
} as const;

export const SOFTWARE: Record<SoftwareId, SoftwareDefinition> = {
  VANILLA: {
    ...javaServer,
    id: "VANILLA",
    label: "Vanilla",
    description: "The official server software from Mojang.",
    category: "vanilla",
    addonKind: "none",
    addonDirectory: null,
    modrinthLoaders: [],
    hangarPlatform: null,
    itzgType: "VANILLA",
  },
  PAPER: {
    ...javaServer,
    id: "PAPER",
    label: "Paper",
    description: "High-performance fork of Spigot with a rich plugin API.",
    category: "plugins",
    addonKind: "plugin",
    addonDirectory: "plugins",
    modrinthLoaders: ["paper", "spigot", "bukkit"],
    hangarPlatform: "PAPER",
    itzgType: "PAPER",
  },
  PURPUR: {
    ...javaServer,
    id: "PURPUR",
    label: "Purpur",
    description: "Paper fork focused on configurability and gameplay features.",
    category: "plugins",
    addonKind: "plugin",
    addonDirectory: "plugins",
    modrinthLoaders: ["purpur", "paper", "spigot", "bukkit"],
    hangarPlatform: "PAPER",
    itzgType: "PURPUR",
  },
  SPIGOT: {
    ...javaServer,
    id: "SPIGOT",
    label: "Spigot",
    description: "The classic Bukkit-compatible plugin server.",
    category: "plugins",
    addonKind: "plugin",
    addonDirectory: "plugins",
    modrinthLoaders: ["spigot", "bukkit"],
    hangarPlatform: null,
    itzgType: "SPIGOT",
  },
  FOLIA: {
    ...javaServer,
    id: "FOLIA",
    label: "Folia",
    description: "Regionised multithreading fork of Paper for large servers.",
    category: "plugins",
    addonKind: "plugin",
    addonDirectory: "plugins",
    modrinthLoaders: ["folia"],
    hangarPlatform: "PAPER",
    itzgType: "FOLIA",
  },
  FABRIC: {
    ...javaServer,
    id: "FABRIC",
    label: "Fabric",
    description: "Lightweight, modern modding toolchain.",
    category: "mods",
    addonKind: "mod",
    addonDirectory: "mods",
    modrinthLoaders: ["fabric"],
    hangarPlatform: null,
    itzgType: "FABRIC",
  },
  QUILT: {
    ...javaServer,
    id: "QUILT",
    label: "Quilt",
    description: "Community-driven fork of Fabric.",
    category: "mods",
    addonKind: "mod",
    addonDirectory: "mods",
    modrinthLoaders: ["quilt", "fabric"],
    hangarPlatform: null,
    itzgType: "QUILT",
  },
  FORGE: {
    ...javaServer,
    id: "FORGE",
    label: "Forge",
    description: "The long-standing mod loader with a huge ecosystem.",
    category: "mods",
    addonKind: "mod",
    addonDirectory: "mods",
    modrinthLoaders: ["forge"],
    hangarPlatform: null,
    itzgType: "FORGE",
  },
  NEOFORGE: {
    ...javaServer,
    id: "NEOFORGE",
    label: "NeoForge",
    description: "Modern community continuation of Forge.",
    category: "mods",
    addonKind: "mod",
    addonDirectory: "mods",
    modrinthLoaders: ["neoforge"],
    hangarPlatform: null,
    itzgType: "NEOFORGE",
  },
  VELOCITY: {
    id: "VELOCITY",
    label: "Velocity",
    description: "Modern, high-performance Minecraft proxy.",
    category: "proxy",
    addonKind: "plugin",
    addonDirectory: "plugins",
    modrinthLoaders: ["velocity"],
    hangarPlatform: "VELOCITY",
    image: "itzg/mc-proxy",
    itzgType: "VELOCITY",
    internalPort: 25577,
    dataPath: "/server",
    usesMinecraftVersion: false,
  },
  BUNGEECORD: {
    id: "BUNGEECORD",
    label: "BungeeCord",
    description: "The original proxy from SpigotMC; uses BungeeCord (legacy) forwarding.",
    category: "proxy",
    addonKind: "plugin",
    addonDirectory: "plugins",
    modrinthLoaders: ["bungeecord"],
    hangarPlatform: "WATERFALL",
    image: "itzg/mc-proxy",
    itzgType: "BUNGEECORD",
    internalPort: 25577,
    dataPath: "/server",
    usesMinecraftVersion: false,
  },
  WATERFALL: {
    id: "WATERFALL",
    label: "Waterfall",
    description: "PaperMC fork of BungeeCord (end of life; Velocity is recommended for new networks).",
    category: "proxy",
    addonKind: "plugin",
    addonDirectory: "plugins",
    modrinthLoaders: ["bungeecord", "waterfall"],
    hangarPlatform: "WATERFALL",
    image: "itzg/mc-proxy",
    itzgType: "WATERFALL",
    internalPort: 25577,
    dataPath: "/server",
    usesMinecraftVersion: false,
  },
  CUSTOM: {
    id: "CUSTOM",
    label: "Custom image",
    description: "Bring your own Docker image and startup command.",
    category: "custom",
    addonKind: "none",
    addonDirectory: null,
    modrinthLoaders: [],
    hangarPlatform: null,
    image: null,
    itzgType: null,
    internalPort: 25565,
    dataPath: "/data",
    usesMinecraftVersion: false,
  },
};

export const JAVA_VERSIONS = ["8", "11", "17", "21", "25"] as const;
export type JavaVersion = (typeof JAVA_VERSIONS)[number];

export function parseMcVersion(version: string): number[] | null {
  if (!/^\d+(\.\d+){1,2}$/.test(version)) return null;
  return version.split(".").map(Number);
}

export function compareMcVersions(a: string, b: string): number {
  const pa = parseMcVersion(a) ?? [Number.MAX_SAFE_INTEGER];
  const pb = parseMcVersion(b) ?? [Number.MAX_SAFE_INTEGER];
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function recommendedJava(mcVersion: string): JavaVersion {
  const v = parseMcVersion(mcVersion);
  if (!v) return "25";
  const [major = 1, minor = 0, patch = 0] = v;
  if (major >= 26) return "25";
  if (minor <= 16) return "8";
  if (minor <= 19 || (minor === 20 && patch <= 4)) return "17";
  return "21";
}

export function imageFor(software: SoftwareId, javaVersion: string, customImage?: string | null): string {
  const def = SOFTWARE[software];
  if (software === "CUSTOM") return customImage ?? "";
  if (software === "VELOCITY") return `${def.image}:java25`; // Velocity 4.x requires Java 25
  if (software === "BUNGEECORD" || software === "WATERFALL") return `${def.image}:java21`;
  return `${def.image}:java${javaVersion}`;
}

export interface BuildEnvInput {
  software: SoftwareId;
  mcVersion: string;
  memoryMb: number;
  jvmArgs: string;
  env: Record<string, string>;
}

export function buildServerEnv(input: BuildEnvInput): Record<string, string> {
  const def = SOFTWARE[input.software];
  const env: Record<string, string> = {};
  if (def.itzgType) {
    env.EULA = "TRUE";
    env.TYPE = def.itzgType;
    // -Xms0 lets the JVM start small and grow up to the limit instead of reserving all RAM at boot.
    env.INIT_MEMORY = "0";
    env.MAX_MEMORY = `${input.memoryMb}M`;
    env.ENABLE_RCON = "true";
    env.CREATE_CONSOLE_IN_PIPE = "true";
    if (def.usesMinecraftVersion) env.VERSION = input.mcVersion || "LATEST";
    if (input.jvmArgs.trim()) env.JVM_OPTS = input.jvmArgs.trim();
  }
  return { ...env, ...input.env };
}

export function commandModeFor(software: SoftwareId): "rcon" | "stdin" {
  return software === "CUSTOM" || isProxySoftware(software) ? "stdin" : "rcon";
}
