import IORedis, { type RedisOptions } from "ioredis";
import { env } from "./env";

const globalForRedis = globalThis as unknown as { redis?: IORedis };

export function redisOptions(): RedisOptions {
  return { maxRetriesPerRequest: null, enableReadyCheck: true, lazyConnect: false };
}

export function redis(): IORedis {
  if (!globalForRedis.redis) {
    globalForRedis.redis = new IORedis(env().REDIS_URL, redisOptions());
    globalForRedis.redis.on("error", (err) => console.error("[redis]", err.message));
  }
  return globalForRedis.redis;
}
