import crypto from "crypto";
import { kvLoad, kvSave } from "@/lib/kv-store";

// Tracks in-flight OTP challenges and PAN/GSTIN attempt counters, keyed by
// vendor code. Persists through lib/kv-store — Redis when configured
// (required once hosted on a serverless platform, where a locally-written
// file from one request isn't visible to the next), a local
// .data/auth.json file otherwise.

const KEY = "vqa:auth";
const FILE = "auth.json";

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

function load(): Promise<AuthStoreShape> {
  return kvLoad(KEY, FILE, empty());
}

function save(store: AuthStoreShape): Promise<void> {
  return kvSave(KEY, FILE, store);
}

function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

/** Generates a 6-digit OTP, stores its hash (never the plaintext), returns the plaintext for delivery. */
export async function createOtpChallenge(vendor: { vendorCode: string; vendorName: string; email: string }): Promise<string> {
  const otp = crypto.randomInt(100000, 999999).toString();
  const store = await load();
  store.otpChallenges[vendor.vendorCode] = {
    vendorCode: vendor.vendorCode,
    vendorName: vendor.vendorName,
    email: vendor.email,
    otpHash: hashOtp(otp),
    expiresAt: Date.now() + OTP_TTL_MS,
    attemptsRemaining: OTP_MAX_ATTEMPTS,
  };
  await save(store);
  return otp;
}

export type OtpVerifyResult =
  | { status: "ok"; vendorName: string; email: string }
  | { status: "expired" | "no_challenge" | "incorrect" | "locked_out" };

export async function verifyOtp(vendorCode: string, submitted: string): Promise<OtpVerifyResult> {
  const store = await load();
  const challenge = store.otpChallenges[vendorCode];
  if (!challenge) return { status: "no_challenge" };
  if (Date.now() > challenge.expiresAt) {
    delete store.otpChallenges[vendorCode];
    await save(store);
    return { status: "expired" };
  }
  if (challenge.attemptsRemaining <= 0) {
    delete store.otpChallenges[vendorCode];
    await save(store);
    return { status: "locked_out" };
  }
  if (challenge.otpHash !== hashOtp(submitted.trim())) {
    challenge.attemptsRemaining -= 1;
    await save(store);
    return { status: "incorrect" };
  }
  delete store.otpChallenges[vendorCode];
  await save(store);
  return { status: "ok", vendorName: challenge.vendorName, email: challenge.email };
}

/** Returns false if the vendor code is currently locked out from PAN/GSTIN attempts. */
export async function checkPanLockout(vendorCode: string): Promise<{ locked: boolean; retryAfterMs?: number }> {
  const store = await load();
  const record = store.panAttempts[vendorCode];
  if (!record || !record.lockedUntil) return { locked: false };
  if (Date.now() > record.lockedUntil) return { locked: false };
  return { locked: true, retryAfterMs: record.lockedUntil - Date.now() };
}

export async function recordPanFailure(vendorCode: string): Promise<void> {
  const store = await load();
  const record = store.panAttempts[vendorCode] ?? { vendorCode, failedAttempts: 0, lockedUntil: null };
  record.failedAttempts += 1;
  if (record.failedAttempts >= PAN_MAX_ATTEMPTS) {
    record.lockedUntil = Date.now() + PAN_LOCKOUT_MS;
    record.failedAttempts = 0;
  }
  store.panAttempts[vendorCode] = record;
  await save(store);
}

export async function clearPanFailures(vendorCode: string): Promise<void> {
  const store = await load();
  delete store.panAttempts[vendorCode];
  await save(store);
}
