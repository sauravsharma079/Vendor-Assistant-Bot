import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminSessionToken, ADMIN_SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { checkAdminLockout, recordAdminFailure, clearAdminFailures } from "@/lib/auth/admin-lockout";
import { addAuditEntry } from "@/lib/store";

function clientKey(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export async function POST(req: NextRequest) {
  const configured = process.env.ADMIN_PASSWORD;
  if (!configured) {
    return NextResponse.json(
      { error: "ADMIN_PASSWORD is not set. Add it to .env.local before business support can sign in." },
      { status: 503 }
    );
  }

  const key = clientKey(req);
  const lockout = checkAdminLockout(key);
  if (lockout.locked) {
    return NextResponse.json(
      { error: "Too many failed attempts. Please try again later." },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  if (!password || !timingSafeStringEqual(password, configured)) {
    recordAdminFailure(key);
    addAuditEntry({
      actor: `admin_ip:${key}`,
      action: "admin_login_failed",
      details: "Incorrect business support password",
    });
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  clearAdminFailures(key);
  addAuditEntry({ actor: `admin_ip:${key}`, action: "admin_login_succeeded", details: "Business support signed in" });

  const token = createAdminSessionToken();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
  return response;
}
