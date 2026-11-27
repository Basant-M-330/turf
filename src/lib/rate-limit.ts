import { redis } from "@/lib/redis";

/**
 * Simple fixed-window rate limiter backed by Redis. Returns true if the request is allowed.
 * `key` should already include the bucket name and identifier, e.g. `ratelimit:login:1.2.3.4`.
 */
export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }
  return count <= limit;
}

/** Best-effort client IP from standard proxy headers (set by Vercel/most reverse proxies). */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
