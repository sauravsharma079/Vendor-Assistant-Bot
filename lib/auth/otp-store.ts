import fs from "fs";
import path from "path";
import crypto from "crypto";

// Tracks in-flight OTP challenges and login attempt counters, keyed by
// vendor code. File-backed for the same reason as lib/store \u2014 fine for
// a demo/prototype, swap for Redis/a database before real production use
// (rate-limit state in particular should not live on local disk once
// this runs on more than one server instance).

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "auth.json");

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const OTP_MAX_ATTEMPTS = 5;
const PAN_MAX_ATTEMPTS = 5;
const PAN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

interface OtpChallenge {
  vendorCode: string;
  vendorName: string;
  email: string;
  otpHash: string;
  expiresAt: number;
  attemptsRemaining: number;
}

interface PanAttemptRecord {
  vendorCode: string;
  failedAttempts: number;
  lockedUntil: number | null;
}

interface AuthStoreShape {
  otpChallenges: Record<string, OtpChallenge>;
  panAttempts: Record<string, PanAttemptRecord>;
}

function empty(): AuthStoreShape {
  return { otpChallenges: {}, panAttempts: {} };
}

function load(): AuthStoreShape {
  try {
    if (!fs.existsSync(FILE)) return empty();
    return JSON.parse(fs.readFileSync(FILE, "utf-8")) as AuthStoreShape;
  } catch {
    return empty();
  }
}

function save(store: AuthStoreShape) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch {
    // best-effort
  }
}

function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

/** Generates a 6-digit OTP, stores its hash (never the plaintext), returns the plaintext for delivery. */
export function createOtpChallenge(vendor: { vendorCode: string; vendorName: string; email: string }): string {
  const otp = crypto.randomInt(100000, 999999).toString();
  const store = load();
  store.otpChallenges[vendor.vendorCode] = {
    vendorCode: vendor.vendorCode,
    vendorName: vendor.vendorName,
    email: vendor.email,
    otpHash: hashOtp(otp),
    expiresAt: Date.now() + OTP_TTL_MS,
    attemptsRemaining: OTP_MAX_ATTEMPTS,
  };
  save(store);
  return otp;
}

export type OtpVerifyResult =
  | { status: "ok"; vendorName: string; email: string }
  | { status: "expired" | "no_challenge" | "incorrect" | "locked_out" };

export function verifyOtp(vendorCode: string, submitted: string): OtpVerifyResult {
  const store = load();
  const challenge = store.otpChallenges[vendorCode];
  if (!challenge) return { status: "no_challenge" };
  if (Date.now() > challenge.expiresAt) {
    delete store.otpChallenges[vendorCode];
    save(store);
    return { status: "expired" };
  }
  if (challenge.attemptsRemaining <= 0) {
    delete store.otpChallenges[vendorCode];
    save(store);
    return { status: "locked_out" };
  }
  if (challenge.otpHash !== hashOtp(submitted.trim())) {
    challenge.attemptsRemaining -= 1;
    save(store);
    return { status: "incorrect" };
  }
  delete store.otpChallenges[vendorCode];
  save(store);
  return { status: "ok", vendorName: challenge.vendorName, email: challenge.email };
}

/** Returns false if the vendor code is currently locked out from PAN/GSTIN attempts. */
export function checkPanLockout(vendorCode: string): { locked: boolean; retryAfterMs?: number } {
  const store = load();
  const record = store.panAttempts[vendorCode];
  if (!record || !record.lockedUntil) return { locked: false };
  if (Date.now() > record.lockedUntil) return { locked: false };
  return { locked: true, retryAfterMs: record.lockedUntil - Date.now() };
}

export function recordPanFailure(vendorCode: string): void {
  const store = load();
  const record = store.panAttempts[vendorCode] ?? { vendorCode, failedAttempts: 0, lockedUntil: null };
  record.failedAttempts += 1;
  if (record.failedAttempts >= PAN_MAX_ATTEMPTS) {
    record.lockedUntil = Date.now() + PAN_LOCKOUT_MS;
    record.failedAttempts = 0;
  }
  store.panAttempts[vendorCode] = record;
  save(store);
}

export function clearPanFailures(vendorCode: string): void {
  const store = load();
  delete store.panAttempts[vendorCode];
  save(store);
}
