export interface EmailSender {
  sendOtp(toEmail: string, otp: string, vendorName: string): Promise<void>;
  sendTicketResolved(toEmail: string, vendorName: string, ticketRef: string, note: string): Promise<void>;
  /** A reply that doesn't close the ticket — a plain update, or a request for more information. */
  sendTicketUpdate(
    toEmail: string,
    vendorName: string,
    ticketRef: string,
    note: string,
    kind: "reply" | "waiting_for_info"
  ): Promise<void>;
  /** Notifies a business support agent that a ticket was assigned to them. */
  sendTicketAssigned(toEmail: string, agentName: string, ticketRef: string, vendorName: string, reason: string): Promise<void>;
}
