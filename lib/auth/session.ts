import crypto from "crypto";

// Signed, tamper-evident session tokens. The vendor identity inside a
// verified session is the ONLY source of truth for "which vendor is this
// request allowed to see data for" \u2014 API routes must never trust a
// vendor code supplied directly in a request body for data access, only
// the vendor code baked into a verified session. This is what makes
// "supplier can only get information for their own content" actually
// enforceable rather than just a UI convention.

export const SESSION_COOKIE_NAME = "vqa_session";
export const ADMIN_SESSION_COOKIE_NAME = "vqa_admin_session";
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours — a support shift, not a checkout flow

export interface SessionPayload {
  vendorCode: string;
  vendorName: string;
  email: string;
  iat: number; // issued-at, epoch ms
  exp: number; // expiry, epoch ms
}

export interface AdminSessionPayload {
  role: "business_support";
  iat: number;
  exp: number;
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not set. Generate one (e.g. `openssl rand -hex 32`) and add it to .env.local " +
        "before the app can issue vendor sessions."
    );
  }
  return secret;
}

function sign(data: string): string {
  return crypto.createHmac("sha256", getSecret()).update(data).digest("base64url");
}

// Generic signed-envelope helpers — vendor sessions and admin sessions are
// both just "a payload, tamper-evidently signed, with an expiry", so both
// build on the same primitive rather than duplicating the crypto.
function signToken<T extends { iat: number; exp: number }>(payload: T): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(body);
  return `${body}.${signature}`;
}

function verifyToken<T extends { iat: number; exp: number }>(token: string | undefined | null): T | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  let expectedSignature: string;
  try {
    expectedSignature = sign(body);
  } catch {
    return null;
  }

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8")) as T;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createSessionToken(vendor: { vendorCode: string; vendorName: string; email: string }): string {
  const now = Date.now();
  return signToken<SessionPayload>({
    vendorCode: vendor.vendorCode,
    vendorName: vendor.vendorName,
    email: vendor.email,
    iat: now,
    exp: now + SESSION_TTL_MS,
  });
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  return verifyToken<SessionPayload>(token);
}

export function createAdminSessionToken(): string {
  const now = Date.now();
  return signToken<AdminSessionPayload>({ role: "business_support", iat: now, exp: now + ADMIN_SESSION_TTL_MS });
}

export function verifyAdminSessionToken(token: string | undefined | null): AdminSessionPayload | null {
  return verifyToken<AdminSessionPayload>(token);
}
