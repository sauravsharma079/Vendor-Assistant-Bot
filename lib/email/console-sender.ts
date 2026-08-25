import type { EmailSender } from "./types";

/**
 * Prints the OTP to the server console instead of emailing it. This is
 * ONLY for local development so you can smoke-test the onboarding flow
 * without standing up SMTP first \u2014 it is not a mock of vendor data (no
 * SAP data flows through this), just a stand-in for the delivery
 * channel. It refuses to run outside development, and the OTP never
 * reaches the client/browser \u2014 only this server-side log.
 */
export class ConsoleEmailSender implements EmailSender {
  async sendOtp(toEmail: string, otp: string, vendorName: string): Promise<void> {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "ConsoleEmailSender cannot run in production. Set EMAIL_MODE=smtp and configure SMTP_* env vars."
      );
    }
    // eslint-disable-next-line no-console
    console.log(
      `\n[DEV ONLY \u2014 not a real email] OTP for ${vendorName} (${toEmail}): ${otp}\n` +
        `This only appears in the server console and is never sent to the browser.\n`
    );
  }

  async sendTicketResolved(toEmail: string, vendorName: string, ticketRef: string, note: string): Promise<void> {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "ConsoleEmailSender cannot run in production. Set EMAIL_MODE=smtp and configure SMTP_* env vars."
      );
    }
    // eslint-disable-next-line no-console
    console.log(
      `\n[DEV ONLY \u2014 not a real email] Ticket ${ticketRef} resolved for ${vendorName} (${toEmail}):\n${note}\n` +
        `This only appears in the server console and is never sent to the browser.\n`
    );
  }

  async sendTicketUpdate(
    toEmail: string,
    vendorName: string,
    ticketRef: string,
    note: string,
    kind: "reply" | "waiting_for_info"
  ): Promise<void> {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "ConsoleEmailSender cannot run in production. Set EMAIL_MODE=smtp and configure SMTP_* env vars."
      );
    }
    const label = kind === "waiting_for_info" ? "Action needed" : "Update";
    // eslint-disable-next-line no-console
    console.log(
      `\n[DEV ONLY \u2014 not a real email] ${label} on ticket ${ticketRef} for ${vendorName} (${toEmail}):\n${note}\n` +
        `This only appears in the server console and is never sent to the browser.\n`
    );
  }

  async sendTicketAssigned(toEmail: string, agentName: string, ticketRef: string, vendorName: string, reason: string): Promise<void> {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "ConsoleEmailSender cannot run in production. Set EMAIL_MODE=smtp and configure SMTP_* env vars."
      );
    }
    // eslint-disable-next-line no-console
    console.log(
      `\n[DEV ONLY \u2014 not a real email] Ticket ${ticketRef} assigned to ${agentName} (${toEmail}) \u2014 ${vendorName}: ${reason}\n` +
        `This only appears in the server console and is never sent to the browser.\n`
    );
  }
}
