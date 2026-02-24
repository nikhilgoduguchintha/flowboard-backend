import { LRUCache } from "lru-cache";
import { redis } from "../lib/redis";
import type { ResolvedSection } from "../types/index.js";

// ─── L1 Cache — In-Memory LRU ─────────────────────────────────────────────────
// Free, instant, 1 minute TTL
// Protects Redis from excessive calls

const localCache = new LRUCache<string, ResolvedSection[]>({
  max: 100, // max 100 entries
  ttl: 60_000, // 1 minute in ms
});

// ─── L2 Cache — Redis ─────────────────────────────────────────────────────────
// Shared across all server instances
// 5 minute TTL

const REDIS_TTL = 300; // seconds

// ─── Key Builder ──────────────────────────────────────────────────────────────

function buildKey(userId: string, projectId: string): string {
  return `layout:${userId}:${projectId}`;
}

// ─── Get Layout ───────────────────────────────────────────────────────────────

export async function getLayout(
  userId: string,
  projectId: string
): Promise<ResolvedSection[] | null> {
  const key = buildKey(userId, projectId);

  // L1 — memory check
  const local = localCache.get(key);
  if (local) {
    console.log(`[Cache] L1 hit — ${key}`);
    return local;
  }

  // L2 — Redis check
  try {
    const cached = await redis.get<string>(key);
    if (cached) {
      console.log(`[Cache] L2 hit — ${key}`);
      const parsed =
        typeof cached === "string"
          ? (JSON.parse(cached) as ResolvedSection[])
          : (cached as ResolvedSection[]);

      // Warm L1 cache from Redis
      localCache.set(key, parsed);
      return parsed;
    }
  } catch (err) {
    // Redis failure should not break the request
    console.error("[Cache] Redis get error:", err);
  }

  console.log(`[Cache] Miss — ${key}`);
  return null;
}

// ─── Set Layout ───────────────────────────────────────────────────────────────

export async function setLayout(
  userId: string,
  projectId: string,
  layout: ResolvedSection[]
): Promise<void> {
  const key = buildKey(userId, projectId);

  // Write to L1
  localCache.set(key, layout);

  // Write to L2
  try {
    await redis.set(key, JSON.stringify(layout), { ex: REDIS_TTL });
    console.log(`[Cache] Set — ${key} (TTL: ${REDIS_TTL}s)`);
  } catch (err) {
    console.error("[Cache] Redis set error:", err);
  }
}

// ─── Invalidate Single User ───────────────────────────────────────────────────

export async function invalidateUserLayout(
  userId: string,
  projectId: string
): Promise<void> {
  const key = buildKey(userId, projectId);

  // Clear L1
  localCache.delete(key);

  // Clear L2
  try {
    await redis.del(key);
    console.log(`[Cache] Invalidated — ${key}`);
  } catch (err) {
    console.error("[Cache] Redis del error:", err);
  }
}

// ─── Invalidate All Project Members ──────────────────────────────────────────
// Called when sprint starts/closes, member added/removed, role changes

export async function invalidateProjectLayout(
  projectId: string,
  memberIds: string[]
): Promise<void> {
  if (memberIds.length === 0) return;

  console.log(
    `[Cache] Invalidating layout for ${memberIds.length} members in project ${projectId}`
  );

  await Promise.all(
    memberIds.map((userId) => invalidateUserLayout(userId, projectId))
  );
}

// ─── Cache Stats ──────────────────────────────────────────────────────────────

export function getCacheStats(): {
  l1Size: number;
  l1Max: number;
} {
  return {
    l1Size: localCache.size,
    l1Max: 100,
  };
}
