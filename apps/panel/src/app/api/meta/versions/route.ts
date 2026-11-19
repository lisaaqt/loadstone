import { handler } from "@/lib/api";
import { redis } from "@/lib/redis";

interface Manifest {
  latest: { release: string; snapshot: string };
  versions: { id: string; type: string; releaseTime: string }[];
}

const CACHE_KEY = "meta:mc-versions";

export const GET = handler(async () => {
  const cached = await redis()
    .get(CACHE_KEY)
    .catch(() => null);
  if (cached) return JSON.parse(cached) as unknown;
  try {
    const res = await fetch("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json", { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as Manifest;
    const result = {
      latest: data.latest.release,
      releases: data.versions.filter((v) => v.type === "release").map((v) => v.id),
    };
    await redis()
      .set(CACHE_KEY, JSON.stringify(result), "EX", 3600)
      .catch(() => undefined);
    return result;
  } catch {
    return { latest: null, releases: [] as string[], error: "Could not load the Minecraft version list" };
  }
});
