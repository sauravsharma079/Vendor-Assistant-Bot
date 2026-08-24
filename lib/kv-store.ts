import fs from "fs";
import path from "path";

// Shared persistence backend for lib/store, lib/auth/otp-store, and
// lib/auth/admin-lockout. Serverless hosts (Vercel included) run every
// request on an isolated, ephemeral instance — a local file written by one
// request is not visible to the next, so plain fs read/write silently
// breaks OTP verification, admin lockout, and the ticket/query-log/audit
// store as soon as this is hosted there.
//
// If KV_REST_API_URL/TOKEN or UPSTASH_REDIS_REST_URL/TOKEN are set (either
// name a Vercel Marketplace Redis integration may inject), every value is
// read/written through Upstash Redis instead — a real, shared, serverless-
// friendly store. Local dev needs none of this: with no env vars set, it
// falls back to the original .data/<file>.json behavior, unchanged.

const DATA_DIR = path.join(process.cwd(), ".data");

function redisEnv(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

type RedisClient = { get<T>(key: string): Promise<T | null>; set(key: string, value: unknown): Promise<unknown> };
let redisClient: RedisClient | null | undefined;

async function getRedis(): Promise<RedisClient | null> {
  if (redisClient !== undefined) return redisClient;
  const env = redisEnv();
  if (!env) {
    redisClient = null;
    return redisClient;
  }
  const { Redis } = await import("@upstash/redis");
  redisClient = new Redis({ url: env.url, token: env.token }) as unknown as RedisClient;
  return redisClient;
}

export async function kvLoad<T>(key: string, file: string, empty: T): Promise<T> {
  const redis = await getRedis();
  if (redis) {
    const val = await redis.get<T>(key);
    return val ?? empty;
  }
  try {
    const filePath = path.join(DATA_DIR, file);
    if (!fs.existsSync(filePath)) return empty;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return empty;
  }
}

export async function kvSave<T>(key: string, file: string, value: T): Promise<void> {
  const redis = await getRedis();
  if (redis) {
    await redis.set(key, value);
    return;
  }
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(value, null, 2), "utf-8");
  } catch {
    // best-effort — local dev only, and only reachable when Redis isn't configured
  }
}
