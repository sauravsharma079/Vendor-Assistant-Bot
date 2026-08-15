import type { EmailSender } from "./types";

let sender: EmailSender | null = null;

export function getEmailSender(): EmailSender {
  if (sender) return sender;

  const mode = process.env.EMAIL_MODE ?? (process.env.NODE_ENV === "production" ? "smtp" : "console");

  if (mode === "smtp") {
    const { SmtpEmailSender } = require("./smtp-sender");
    sender = new SmtpEmailSender();
  } else {
    const { ConsoleEmailSender } = require("./console-sender");
    sender = new ConsoleEmailSender();
  }
  return sender as EmailSender;
}
