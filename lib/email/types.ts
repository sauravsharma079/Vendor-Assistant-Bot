export interface EmailSender {
  sendOtp(toEmail: string, otp: string, vendorName: string): Promise<void>;
}
