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

  async sendTicketResolved(toEmail: string, vendorName: string, ticketRef: string, note: string): Promise<void> {
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
      subject: `Update on your Vendor Query Assistant ticket ${ticketRef}`,
      text: `Hi ${vendorName},\n\n` + `${note}\n\n` + `Ticket reference: ${ticketRef}\n`,
    });
  }

  async sendTicketUpdate(
    toEmail: string,
    vendorName: string,
    ticketRef: string,
    note: string,
    kind: "reply" | "waiting_for_info"
  ): Promise<void> {
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

    const subject =
      kind === "waiting_for_info"
        ? `Action needed on your Vendor Query Assistant ticket ${ticketRef}`
        : `Update on your Vendor Query Assistant ticket ${ticketRef}`;

    await transport.sendMail({
      from,
      to: toEmail,
      subject,
      text: `Hi ${vendorName},\n\n${note}\n\nTicket reference: ${ticketRef}\n`,
    });
  }

  async sendTicketAssigned(toEmail: string, agentName: string, ticketRef: string, vendorName: string, reason: string): Promise<void> {
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
      subject: `Ticket ${ticketRef} assigned to you`,
      text:
        `Hi ${agentName},\n\n` +
        `Ticket ${ticketRef} (${vendorName}) has been assigned to you.\n\n` +
        `${reason}\n\n` +
        `Open the Business Support dashboard to respond.\n`,
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
