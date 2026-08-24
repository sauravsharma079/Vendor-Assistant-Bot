import { NextRequest, NextResponse } from "next/server";
import { getSapConnector } from "@/lib/sap";
import { SapNotConfiguredError, SapRequestError } from "@/lib/sap/s4hana-connector";
import { createOtpChallenge, checkPanLockout, recordPanFailure, clearPanFailures } from "@/lib/auth/otp-store";
import { getEmailSender } from "@/lib/email";
import { addAuditEntry } from "@/lib/store";
import { maskTaxId, maskEmail } from "@/lib/privacy/mask";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const vendorCode = (body?.vendorCode ?? "").trim();
  const panOrGstin = (body?.panOrGstin ?? "").trim();

  if (!vendorCode || !panOrGstin) {
    return NextResponse.json({ error: "vendorCode and panOrGstin are required" }, { status: 400 });
  }

  const lockout = await checkPanLockout(vendorCode);
  if (lockout.locked) {
    return NextResponse.json(
      { error: "Too many failed attempts. Please try again later or contact business support." },
      { status: 429 }
    );
  }

  try {
    const sap = getSapConnector();
    const vendor = await sap.verifyVendor(vendorCode, panOrGstin);

    if (!vendor) {
      await recordPanFailure(vendorCode);
      await addAuditEntry({
        actor: `vendor:${vendorCode}`,
        action: "onboarding_verification_failed",
        details: `Vendor code ${vendorCode} with PAN/GSTIN ${maskTaxId(panOrGstin)} did not match SAP vendor master`,
      });
      // Deliberately generic message \u2014 doesn't reveal whether the vendor
      // code or the PAN/GSTIN was the mismatch, to avoid helping enumerate
      // valid vendor codes.
      return NextResponse.json({ error: "We couldn't verify those details against SAP. Please double-check and try again." }, { status: 401 });
    }

    if (!vendor.email) {
      await addAuditEntry({
        actor: `vendor:${vendorCode}`,
        action: "onboarding_no_email_on_file",
        details: `Vendor ${vendor.vendorName} (${vendorCode}) has no email on file in SAP \u2014 cannot send OTP`,
      });
      return NextResponse.json(
        { error: "No verified email is on file for this vendor in SAP. Please contact business support to update your vendor master record." },
        { status: 422 }
      );
    }

    await clearPanFailures(vendorCode);
    const otp = await createOtpChallenge(vendor);
    await getEmailSender().sendOtp(vendor.email, otp, vendor.vendorName);

    await addAuditEntry({
      actor: `vendor:${vendorCode}`,
      action: "otp_sent",
      details: `OTP sent to ${maskEmail(vendor.email)} for ${vendor.vendorName} (${vendorCode})`,
    });

    return NextResponse.json({ ok: true, maskedEmail: maskEmail(vendor.email) });
  } catch (err) {
    if (err instanceof SapNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof SapRequestError) {
      return NextResponse.json({ error: `SAP request failed: ${err.message}` }, { status: 502 });
    }
    if (err instanceof Error && err.message.includes("SMTP")) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }
}
