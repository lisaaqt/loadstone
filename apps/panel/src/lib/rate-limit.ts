import { redis } from "./redis";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
}

export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
  const redisKey = `rl:${key}:${bucket}`;
  try {
    const client = redis();
    const [[, count]] = (await client.multi().incr(redisKey).expire(redisKey, windowSeconds + 1).exec()) as [
      [Error | null, number],
    ];
    const resetSeconds = windowSeconds - (Math.floor(Date.now() / 1000) % windowSeconds);
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetSeconds };
  } catch (err) {
    console.error("[rate-limit] redis unavailable, failing open", (err as Error).message);
    return { allowed: true, remaining: limit, resetSeconds: windowSeconds };
  }
}
