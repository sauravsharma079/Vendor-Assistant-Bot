export interface EmailSender {
  sendOtp(toEmail: string, otp: string, vendorName: string): Promise<void>;
  sendTicketResolved(toEmail: string, vendorName: string, ticketRef: string, note: string): Promise<void>;
}
