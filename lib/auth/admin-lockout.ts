import fs from "fs";
import path from "path";

// Brute-force protection for the shared admin/business-support password,
// keyed by source IP. Mirrors the PAN/GSTIN lockout in otp-store.ts. File-
// backed for the same reason as the rest of lib/auth — fine for a
// single-instance demo, move to Redis/a database before multi-instance use.

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "admin-auth.json");

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

interface AttemptRecord {
  failedAttempts: number;
  lockedUntil: number | null;
}

type StoreShape = Record<string, AttemptRecord>;

function load(): StoreShape {
  try {
    if (!fs.existsSync(FILE)) return {};
    return JSON.parse(fs.readFileSync(FILE, "utf-8")) as StoreShape;
  } catch {
    return {};
  }
}

function save(store: StoreShape) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch {
    // best-effort
  }
}

export function checkAdminLockout(key: string): { locked: boolean; retryAfterMs?: number } {
  const store = load();
  const record = store[key];
  if (!record || !record.lockedUntil) return { locked: false };
  if (Date.now() > record.lockedUntil) return { locked: false };
  return { locked: true, retryAfterMs: record.lockedUntil - Date.now() };
}

export function recordAdminFailure(key: string): void {
  const store = load();
  const record = store[key] ?? { failedAttempts: 0, lockedUntil: null };
  record.failedAttempts += 1;
  if (record.failedAttempts >= MAX_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_MS;
    record.failedAttempts = 0;
  }
  store[key] = record;
  save(store);
}

export function clearAdminFailures(key: string): void {
  const store = load();
  delete store[key];
  save(store);
}
