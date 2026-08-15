import { getSapConnector } from "@/lib/sap";
import { SapNotConfiguredError, SapRequestError } from "@/lib/sap/s4hana-connector";
import type { QueryType, VendorIdentity } from "@/lib/sap/types";
import { addQueryLogEntry, addTicket, addAuditEntry } from "@/lib/store";

const SLA_HOURS_BY_TYPE: Record<QueryType, number> = {
  invoice_status: 24,
  payment_status: 24,
  form16: 48,
};

export interface ResolveParams {
  vendor: Pick<VendorIdentity, "vendorCode" | "vendorName" | "email">;
  queryType: QueryType;
  reference: string; // invoice/PO number, or financial year for form16
}

export type ResolveResult =
  | { kind: "resolved"; summary: string; data: unknown }
  | { kind: "escalated"; summary: string; ticketId: string; slaDueAt: string }
  | { kind: "system_error"; message: string };

export async function resolveQuery(params: ResolveParams): Promise<ResolveResult> {
  const started = Date.now();
  // The caller (app/api/query/route.ts) has already resolved `vendor`
  // from a signed session token \u2014 identity is not re-verified against
  // PAN/GSTIN here. Every SAP lookup below is still scoped server-side to
  // vendor.vendorCode, so this function can never return another
  // vendor's data even if it wanted to.
  const vendor = params.vendor as VendorIdentity;

  try {
    switch (params.queryType) {
      case "invoice_status":
        return await resolveInvoice(vendor, params.reference, started);
      case "payment_status":
        return await resolvePayment(vendor, params.reference, started);
      case "form16":
        return await resolveForm16(vendor, params.reference, started);
    }
  } catch (err) {
    return sapErrorToResult(err);
  }
}

function sapErrorToResult(err: unknown): ResolveResult {
  if (err instanceof SapNotConfiguredError) {
    return {
      kind: "system_error",
      message:
        "This assistant isn't connected to SAP yet \u2014 the S/4HANA sandbox connection hasn't been configured. Please contact Veltriance to complete setup.",
    };
  }
  if (err instanceof SapRequestError) {
    return {
      kind: "system_error",
      message: `SAP couldn't process this request right now (${err.message}). Please try again shortly or contact business support.`,
    };
  }
  throw err;
}

async function escalate(
  vendor: VendorIdentity,
  queryType: QueryType,
  reference: string,
  reason: string,
  started: number
): Promise<ResolveResult> {
  const queryLogEntry = addQueryLogEntry({
    vendorCode: vendor.vendorCode,
    vendorName: vendor.vendorName,
    queryType,
    reference: reference || null,
    outcome: "escalated",
    responseSummary: reason,
    resolutionSeconds: (Date.now() - started) / 1000,
  });

  const slaHours = SLA_HOURS_BY_TYPE[queryType];
  const slaDueAt = new Date(Date.now() + slaHours * 3600 * 1000).toISOString();

  const ticket = addTicket({
    vendorCode: vendor.vendorCode,
    vendorName: vendor.vendorName,
    queryType,
    reference: reference || null,
    reason,
    status: "open",
    slaDueAt,
    queryLogId: queryLogEntry.id,
  });

  addAuditEntry({
    actor: "system",
    action: "ticket_created",
    details: `Ticket ${ticket.id} created for ${vendor.vendorName} (${queryType}): ${reason}`,
  });

  return {
    kind: "escalated",
    summary: `I couldn't fully resolve this automatically \u2014 ${reason}. I've raised ticket ${ticket.id} for business support, due within ${slaHours}h.`,
    ticketId: ticket.id,
    slaDueAt,
  };
}

async function resolveInvoice(vendor: VendorIdentity, reference: string, started: number): Promise<ResolveResult> {
  const sap = getSapConnector();
  if (!reference) {
    return escalate(vendor, "invoice_status", reference, "No invoice or PO number was provided", started);
  }
  const invoice = await sap.getInvoiceStatus(vendor.vendorCode, reference);
  if (!invoice) {
    return escalate(vendor, "invoice_status", reference, `Invoice/PO ${reference} not found in SAP`, started);
  }

  if (invoice.approvalStatus === "Blocked" || invoice.approvalStatus === "Rejected") {
    return escalate(
      vendor,
      "invoice_status",
      reference,
      `Invoice ${invoice.invoiceNo} is ${invoice.approvalStatus.toLowerCase()}${invoice.blockReason ? ` (${invoice.blockReason})` : ""}`,
      started
    );
  }

  const summary =
    `Invoice ${invoice.invoiceNo} (PO ${invoice.poNumber}), posted ${invoice.postingDate}: ` +
    `${invoice.approvalStatus}. GRN ${invoice.grnMatched ? `matched (${invoice.grnNumber})` : "not yet matched"}. ` +
    `Amount ${invoice.currency} ${invoice.amount.toLocaleString("en-IN")}.`;

  addQueryLogEntry({
    vendorCode: vendor.vendorCode,
    vendorName: vendor.vendorName,
    queryType: "invoice_status",
    reference,
    outcome: "auto_resolved",
    responseSummary: summary,
    resolutionSeconds: (Date.now() - started) / 1000,
  });

  return { kind: "resolved", summary, data: invoice };
}

async function resolvePayment(vendor: VendorIdentity, reference: string, started: number): Promise<ResolveResult> {
  const sap = getSapConnector();
  const payments = await sap.getPaymentStatus(vendor.vendorCode, reference || undefined);

  if (payments.length === 0) {
    return escalate(
      vendor,
      "payment_status",
      reference,
      reference ? `No payment record found for ${reference}` : "No payment records found for this vendor",
      started
    );
  }

  const onHold = payments.filter((p) => p.status === "On Hold");
  if (onHold.length > 0 && payments.length === onHold.length) {
    return escalate(
      vendor,
      "payment_status",
      reference,
      `Payment on hold${onHold[0].holdReason ? `: ${onHold[0].holdReason}` : ""}`,
      started
    );
  }

  const summary = payments
    .map((p) => {
      if (p.status === "Cleared") {
        return `Invoice ${p.invoiceNo}: Cleared on ${p.clearingDate}, ${p.currency} ${p.amount.toLocaleString("en-IN")} (ref ${p.bankReference}).`;
      }
      if (p.status === "Scheduled") {
        return `Invoice ${p.invoiceNo}: Scheduled for payment on ${p.scheduledDate}, ${p.currency} ${p.amount.toLocaleString("en-IN")}.`;
      }
      if (p.status === "On Hold") {
        return `Invoice ${p.invoiceNo}: On hold${p.holdReason ? ` \u2014 ${p.holdReason}` : ""}.`;
      }
      return `Invoice ${p.invoiceNo}: Open, ${p.currency} ${p.amount.toLocaleString("en-IN")}.`;
    })
    .join(" ");

  addQueryLogEntry({
    vendorCode: vendor.vendorCode,
    vendorName: vendor.vendorName,
    queryType: "payment_status",
    reference: reference || null,
    outcome: "auto_resolved",
    responseSummary: summary,
    resolutionSeconds: (Date.now() - started) / 1000,
  });

  return { kind: "resolved", summary, data: payments };
}

async function resolveForm16(vendor: VendorIdentity, reference: string, started: number): Promise<ResolveResult> {
  const sap = getSapConnector();
  const financialYear = reference || "2025-26";
  const cert = await sap.getForm16(vendor.vendorCode, financialYear);

  if (!cert || cert.status !== "Available") {
    const reason = !cert
      ? `No Form 16 record found for FY ${financialYear}`
      : `Form 16 for FY ${financialYear} ${cert.quarter} is ${cert.status.toLowerCase()}`;
    return escalate(vendor, "form16", reference, reason, started);
  }

  const summary =
    `Form 16 (${cert.certificateNo}) for FY ${cert.financialYear} ${cert.quarter} is available. ` +
    `TDS amount: ${cert.currency} ${cert.tdsAmount.toLocaleString("en-IN")}. Download: ${cert.downloadUrl}`;

  addQueryLogEntry({
    vendorCode: vendor.vendorCode,
    vendorName: vendor.vendorName,
    queryType: "form16",
    reference: financialYear,
    outcome: "auto_resolved",
    responseSummary: summary,
    resolutionSeconds: (Date.now() - started) / 1000,
  });

  return { kind: "resolved", summary, data: cert };
}
