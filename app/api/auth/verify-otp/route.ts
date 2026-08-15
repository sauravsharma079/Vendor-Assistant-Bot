import { NextRequest, NextResponse } from "next/server";
import { verifyOtp } from "@/lib/auth/otp-store";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { addAuditEntry } from "@/lib/store";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const vendorCode = (body?.vendorCode ?? "").trim();
  const otp = (body?.otp ?? "").trim();

  if (!vendorCode || !otp) {
    return NextResponse.json({ error: "vendorCode and otp are required" }, { status: 400 });
  }

  const result = verifyOtp(vendorCode, otp);

  if (result.status !== "ok") {
    const messages: Record<string, string> = {
      expired: "That code has expired. Please request a new one.",
      no_challenge: "No pending verification for this vendor. Please start over.",
      incorrect: "Incorrect code. Please try again.",
      locked_out: "Too many incorrect attempts. Please request a new code.",
    };
    addAuditEntry({
      actor: `vendor:${vendorCode}`,
      action: "otp_verification_failed",
      details: `OTP check for ${vendorCode}: ${result.status}`,
    });
    return NextResponse.json({ error: messages[result.status] }, { status: 401 });
  }

  const token = createSessionToken({ vendorCode, vendorName: result.vendorName, email: result.email });

  addAuditEntry({
    actor: `vendor:${vendorCode}`,
    action: "session_created",
    details: `${result.vendorName} (${vendorCode}) completed onboarding and started a session`,
  });

  const response = NextResponse.json({ ok: true, vendorName: result.vendorName });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 30 * 60,
  });
  return response;
}
