import nodemailer from "nodemailer";
import type { EmailSender } from "./types";

/**
 * Sends OTP codes over real SMTP. Requires SMTP_HOST/PORT/USER/PASS and
 * SMTP_FROM to be set (see .env.example) \u2014 any provider that speaks
 * SMTP works (SES, SendGrid, Postmark, your own mail server). If these
 * aren't configured, this throws rather than silently no-op'ing, so a
 * misconfiguration is loud instead of quietly "verifying" vendors who
 * never actually received a code.
 */
export class SmtpEmailSender implements EmailSender {
  async sendOtp(toEmail: string, otp: string, vendorName: string): Promise<void> {
    const host = requireEnv("SMTP_HOST");
    const port = Number(requireEnv("SMTP_PORT"));
    const user = requireEnv("SMTP_USER");
    const pass = requireEnv("SMTP_PASS");
    const from = requireEnv("SMTP_FROM");

    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    await transport.sendMail({
      from,
      to: toEmail,
      subject: "Your Vendor Query Assistant verification code",
      text:
        `Hi ${vendorName},\n\n` +
        `Your one-time verification code is: ${otp}\n\n` +
        `This code expires in 5 minutes. If you didn't request this, you can ignore this email.\n`,
    });
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Configure SMTP delivery in .env.local (see .env.example) before OTP emails can be sent.`);
  }
  return value;
}
