// Domain types for the Vendor Query Resolution bot.
// These mirror the fields we'd expect back from real SAP S/4HANA OData
// services (see connector.ts for the mapping), so swapping the mock
// connector for a live one should not require changing anything above
// this layer.

export type QueryType = "invoice_status" | "payment_status" | "form16";

export interface VendorIdentity {
  vendorCode: string; // SAP Vendor/Supplier (LIFNR)
  vendorName: string;
  pan: string;
  gstin: string;
  plant: string; // manufacturing plant the vendor primarily supplies
  category: string; // e.g. Raw Material, Tooling, Packaging, MRO
  email: string;
}

export interface InvoiceStatusResult {
  invoiceNo: string; // SAP Invoice Document Number
  poNumber: string;
  postingDate: string;
  grnMatched: boolean;
  grnNumber: string | null;
  approvalStatus: "Pending Approval" | "Approved" | "Blocked" | "Rejected";
  blockReason: string | null;
  amount: number;
  currency: string;
}

export interface PaymentStatusResult {
  invoiceNo: string;
  paymentDocNo: string | null;
  status: "Cleared" | "Scheduled" | "Open" | "On Hold";
  clearingDate: string | null;
  scheduledDate: string | null;
  amount: number;
  currency: string;
  bankReference: string | null;
  holdReason: string | null;
}

export interface Form16Result {
  certificateNo: string;
  financialYear: string; // e.g. "2025-26"
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
  tdsAmount: number;
  currency: string;
  status: "Available" | "Not Yet Generated" | "Under Processing";
  downloadUrl: string | null;
}

export interface SapConnector {
  /** Verify a vendor's identity against SAP vendor master (LFA1/LFB1). */
  verifyVendor(vendorCode: string, panOrGstin: string): Promise<VendorIdentity | null>;

  /** Look up invoice status via API_SUPPLIERINVOICE_PROCESS_SRV (or BSIK/BSAK fallback). */
  getInvoiceStatus(vendorCode: string, invoiceOrPo: string): Promise<InvoiceStatusResult | null>;

  /** Look up payment / clearing status for a vendor's open & cleared items. */
  getPaymentStatus(vendorCode: string, invoiceOrPoRef?: string): Promise<PaymentStatusResult[]>;

  /** Look up Form 16 / withholding tax certificate (WITH_ITEM). */
  getForm16(vendorCode: string, financialYear: string): Promise<Form16Result | null>;
}
