import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { lazyConnect: true });

redis.on("error", (err) => {
  console.error("Redis connection error:", err.message);
});

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

export const SLOT_HOLD_SECONDS = 300;

export function slotLockKey(courtId: string, date: string, startTime: string) {
  return `lock:${courtId}:${date}:${startTime}`;
}

/**
 * Atomically acquires a 5-minute hold on a slot. Returns true if this call won the lock.
 */
export async function acquireSlotLock(
  courtId: string,
  date: string,
  startTime: string,
  bookingId: string
) {
  const key = slotLockKey(courtId, date, startTime);
  const result = await redis.set(key, bookingId, "EX", SLOT_HOLD_SECONDS, "NX");
  return result === "OK";
}

export async function releaseSlotLock(courtId: string, date: string, startTime: string) {
  await redis.del(slotLockKey(courtId, date, startTime));
}

export async function isSlotLocked(courtId: string, date: string, startTime: string) {
  const value = await redis.exists(slotLockKey(courtId, date, startTime));
  return value === 1;
}

/**
 * Acquires a hold across several consecutive unit slots (a multi-hour booking) atomically
 * as a set: if any unit is already held, everything acquired so far is rolled back.
 */
export async function acquireSlotLockRange(
  courtId: string,
  date: string,
  unitStartTimes: string[],
  bookingId: string
) {
  const acquired: string[] = [];
  for (const startTime of unitStartTimes) {
    const ok = await acquireSlotLock(courtId, date, startTime, bookingId);
    if (!ok) {
      await releaseSlotLockRange(courtId, date, acquired);
      return false;
    }
    acquired.push(startTime);
  }
  return true;
}

export async function releaseSlotLockRange(courtId: string, date: string, unitStartTimes: string[]) {
  await Promise.all(unitStartTimes.map((startTime) => releaseSlotLock(courtId, date, startTime)));
}
