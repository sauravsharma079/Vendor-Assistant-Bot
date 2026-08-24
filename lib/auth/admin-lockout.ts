import { kvLoad, kvSave } from "@/lib/kv-store";

// Brute-force protection for the shared admin/business-support password,
// keyed by source IP. Mirrors the PAN/GSTIN lockout in otp-store.ts.
// Persists through lib/kv-store — Redis when configured (required once
// hosted on a serverless platform), a local .data/admin-auth.json file
// otherwise.

const KEY = "vqa:admin-auth";
const FILE = "admin-auth.json";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

interface AttemptRecord {
  failedAttempts: number;
  lockedUntil: number | null;
}

type StoreShape = Record<string, AttemptRecord>;

function load(): Promise<StoreShape> {
  return kvLoad(KEY, FILE, {} as StoreShape);
}

function save(store: StoreShape): Promise<void> {
  return kvSave(KEY, FILE, store);
}

export async function checkAdminLockout(key: string): Promise<{ locked: boolean; retryAfterMs?: number }> {
  const store = await load();
  const record = store[key];
  if (!record || !record.lockedUntil) return { locked: false };
  if (Date.now() > record.lockedUntil) return { locked: false };
  return { locked: true, retryAfterMs: record.lockedUntil - Date.now() };
}

export async function recordAdminFailure(key: string): Promise<void> {
  const store = await load();
  const record = store[key] ?? { failedAttempts: 0, lockedUntil: null };
  record.failedAttempts += 1;
  if (record.failedAttempts >= MAX_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_MS;
    record.failedAttempts = 0;
  }
  store[key] = record;
  await save(store);
}

export async function clearAdminFailures(key: string): Promise<void> {
  const store = await load();
  delete store[key];
  await save(store);
}
