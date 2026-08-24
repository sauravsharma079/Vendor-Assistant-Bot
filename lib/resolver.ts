import { getSapConnector } from "@/lib/sap";
import { SapNotConfiguredError, SapRequestError } from "@/lib/sap/s4hana-connector";
import type { QueryType, VendorIdentity, InvoiceStatusResult, PaymentStatusResult } from "@/lib/sap/types";
import { addQueryLogEntry, addTicket, addAuditEntry } from "@/lib/store";

import { formatTicketReference } from "@/lib/ticket-ref";

const SLA_HOURS_BY_TYPE: Record<QueryType, number> = {
  invoice_status: 24,
  payment_status: 24,
  form16: 48,
  account_statement: 24,
  general_inquiry: 48,
};

export interface ResolveParams {
  vendor: Pick<VendorIdentity, "vendorCode" | "vendorName" | "email">;
  queryType: QueryType;
  // invoice/PO number, financial year for form16, or "YYYY-MM-DD:YYYY-MM-DD"
  // for account_statement (defaults to the current FY if omitted/unparseable)
  reference: string;
}

export interface AgingBucket {
  bucket: string;
  count: number;
  amount: number;
}

export type ResolveResult =
  | { kind: "resolved"; summary: string; data: unknown }
  | { kind: "escalated"; summary: string; ticketId: string; slaDueAt: string }
  | { kind: "system_error"; message: string }
  | {
      kind: "statement";
      summary: string;
      dateFrom: string;
      dateTo: string;
      currency: string;
      invoices: InvoiceStatusResult[];
      payments: PaymentStatusResult[];
      // Outstanding = not yet Cleared. "This month"/"this quarter" use each
      // invoice's scheduled payment date if one exists, else its posting
      // date — the data model has no separate due-date field to go by.
      agingSummary: AgingBucket[];
      totalOutstanding: number;
      totalPayableThisMonth: number;
      totalPayableThisQuarter: number;
      paidInvoices: (InvoiceStatusResult & { paymentDate: string | null })[];
      pendingApprovalInvoices: InvoiceStatusResult[];
    };

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
      case "account_statement":
        return await resolveAccountStatement(vendor, params.reference, started);
      case "general_inquiry":
        return await resolveGeneralInquiry(vendor, params.reference, started);
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
  const queryLogEntry = await addQueryLogEntry({
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

  const ticket = await addTicket({
    vendorCode: vendor.vendorCode,
    vendorName: vendor.vendorName,
    vendorEmail: vendor.email,
    queryType,
    reference: reference || null,
    reason,
    status: "open",
    slaDueAt,
    queryLogId: queryLogEntry.id,
    resolutionNote: null,
    assignee: null,
  });

  await addAuditEntry({
    actor: "system",
    action: "ticket_created",
    details: `Ticket ${ticket.id} created for ${vendor.vendorName} (${queryType}): ${reason}`,
  });

  const ticketRef = formatTicketReference(ticket.id);
  // `reason` can be raw, unpunctuated vendor text (e.g. a general_inquiry
  // description) as well as an already-punctuated system-generated one —
  // this keeps the join grammatical either way.
  const reasonSentence = /[.!?]$/.test(reason.trim()) ? reason.trim() : `${reason.trim()}.`;

  return {
    kind: "escalated",
    summary:
      `${reasonSentence} This has been escalated to our business support team for review ` +
      `(reference ${ticketRef}), with a response expected within ${slaHours} hours.`,
    ticketId: ticketRef,
    slaDueAt,
  };
}

// Called when a vendor already got an answer but still needs help with it
// (e.g. "invoice status says approved but I haven't been paid") — reuses
// the same escalate() path a failed lookup takes, just with the vendor's
// own description as the reason instead of a system-detected one.
export async function openFollowUpTicket(
  vendorInput: Pick<VendorIdentity, "vendorCode" | "vendorName" | "email">,
  queryType: QueryType,
  reference: string,
  description: string
): Promise<{ summary: string; ticketId: string; slaDueAt: string }> {
  const result = await escalate(vendorInput as VendorIdentity, queryType, reference, description, Date.now());
  if (result.kind !== "escalated") {
    throw new Error("escalate() unexpectedly returned a non-escalated result");
  }
  return { summary: result.summary, ticketId: result.ticketId, slaDueAt: result.slaDueAt };
}

// Reached only via the AI free-text layer, when parseVendorIntent()
// recognizes a legitimate vendor request that's genuinely outside the
// other four self-service types (e.g. "update my vendor address") — never
// a SAP lookup, always a direct, immediate escalation using the vendor's
// own message as the ticket description, so they aren't asked to repeat
// themselves.
async function resolveGeneralInquiry(vendor: VendorIdentity, reference: string, started: number): Promise<ResolveResult> {
  const message = reference.trim() || "No further details were provided.";
  return escalate(
    vendor,
    "general_inquiry",
    reference,
    `This isn't something covered by self-service lookups. Your request has been shared with our Business Support team: "${message}".`,
    started
  );
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

  const detail =
    `Invoice ${invoice.invoiceNo} (PO ${invoice.poNumber}), posted on ${invoice.postingDate}. ` +
    `Status: ${invoice.approvalStatus}. Goods Receipt: ${invoice.grnMatched ? `Matched (${invoice.grnNumber})` : "Not yet matched"}. ` +
    `Amount: ${invoice.currency} ${invoice.amount.toLocaleString("en-IN")}.`;

  if (invoice.approvalStatus === "Blocked" || invoice.approvalStatus === "Rejected") {
    return escalate(
      vendor,
      "invoice_status",
      reference,
      `${detail}${invoice.blockReason ? ` Reason: ${invoice.blockReason}.` : ""}`,
      started
    );
  }

  const summary = detail;

  await addQueryLogEntry({
    vendorCode: vendor.vendorCode,
    vendorName: vendor.vendorName,
    queryType: "invoice_status",
    reference,
    outcome: "auto_resolved",
    responseSummary: summary,
    resolutionSeconds: (Date.now() - started) / 1000,
  });

  // Best-effort enrichment — a PO lookup failure shouldn't cost the vendor
  // their (already-correct) invoice answer, it just means no PO card.
  const purchaseOrder = await sap.getPurchaseOrder(vendor.vendorCode, invoice.poNumber).catch(() => null);

  return { kind: "resolved", summary, data: { ...invoice, purchaseOrder } };
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

  await addQueryLogEntry({
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
      ? `No Form 16A / Form 26AS / TDS record found for FY ${financialYear}`
      : `Form 16A / Form 26AS / TDS for FY ${financialYear} ${cert.quarter} is ${cert.status.toLowerCase()}`;
    return escalate(vendor, "form16", reference, reason, started);
  }

  const summary =
    `Form 16A / Form 26AS / TDS (${cert.certificateNo}) for FY ${cert.financialYear} ${cert.quarter} is available. ` +
    `TDS amount: ${cert.currency} ${cert.tdsAmount.toLocaleString("en-IN")}. Download: ${cert.downloadUrl}`;

  await addQueryLogEntry({
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

// India's financial year runs April 1 - March 31.
function currentFinancialYearRange(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; // Jan-Mar belongs to the FY that started the previous April
  return { dateFrom: `${startYear}-04-01`, dateTo: `${startYear + 1}-03-31` };
}

function parseDateRange(reference: string): { dateFrom: string; dateTo: string } {
  const match = reference.trim().match(/^(\d{4}-\d{2}-\d{2})\s*:\s*(\d{4}-\d{2}-\d{2})$/);
  if (match) return { dateFrom: match[1], dateTo: match[2] };
  return currentFinancialYearRange();
}

const AGING_BUCKETS = ["0-30 days", "31-60 days", "61-90 days", "90+ days"];

function agingBucketFor(days: number): string {
  if (days <= 30) return AGING_BUCKETS[0];
  if (days <= 60) return AGING_BUCKETS[1];
  if (days <= 90) return AGING_BUCKETS[2];
  return AGING_BUCKETS[3];
}

function isSameMonth(dateStr: string, ref: Date): boolean {
  const d = new Date(dateStr);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

function isSameQuarter(dateStr: string, ref: Date): boolean {
  const d = new Date(dateStr);
  return d.getFullYear() === ref.getFullYear() && Math.floor(d.getMonth() / 3) === Math.floor(ref.getMonth() / 3);
}

async function resolveAccountStatement(vendor: VendorIdentity, reference: string, started: number): Promise<ResolveResult> {
  const sap = getSapConnector();
  const { dateFrom, dateTo } = parseDateRange(reference);

  const invoices = await sap.listInvoices(vendor.vendorCode, dateFrom, dateTo);
  if (invoices.length === 0) {
    return escalate(vendor, "account_statement", reference, `No invoices found between ${dateFrom} and ${dateTo}`, started);
  }

  // Payments are joined against this invoice set rather than re-fetched
  // per-invoice — getPaymentStatus() with no reference already returns
  // every payment for the vendor.
  const invoiceNos = new Set(invoices.map((i) => i.invoiceNo));
  const allPayments = await sap.getPaymentStatus(vendor.vendorCode);
  const payments = allPayments.filter((p) => invoiceNos.has(p.invoiceNo));
  const paymentByInvoice = new Map(payments.map((p) => [p.invoiceNo, p]));

  const currency = invoices[0].currency;
  const totalInvoiced = invoices.reduce((s, i) => s + i.amount, 0);
  const totalCleared = payments.filter((p) => p.status === "Cleared").reduce((s, p) => s + p.amount, 0);

  const outstandingInvoices = invoices.filter((inv) => paymentByInvoice.get(inv.invoiceNo)?.status !== "Cleared");
  const totalOutstanding = outstandingInvoices.reduce((s, i) => s + i.amount, 0);

  const now = new Date();
  const agingTotals = new Map(AGING_BUCKETS.map((b) => [b, { count: 0, amount: 0 }]));
  let totalPayableThisMonth = 0;
  let totalPayableThisQuarter = 0;

  for (const inv of outstandingInvoices) {
    const daysOutstanding = Math.floor((now.getTime() - new Date(inv.postingDate).getTime()) / 86_400_000);
    const bucket = agingTotals.get(agingBucketFor(Math.max(daysOutstanding, 0)))!;
    bucket.count += 1;
    bucket.amount += inv.amount;

    // Best available proxy for "when this is due" — a scheduled payment
    // date if SAP already has one, otherwise the invoice's own posting date.
    const expectedDate = paymentByInvoice.get(inv.invoiceNo)?.scheduledDate ?? inv.postingDate;
    if (isSameMonth(expectedDate, now)) totalPayableThisMonth += inv.amount;
    if (isSameQuarter(expectedDate, now)) totalPayableThisQuarter += inv.amount;
  }

  const agingSummary: AgingBucket[] = AGING_BUCKETS.map((bucket) => ({ bucket, ...agingTotals.get(bucket)! }));

  const paidInvoices = invoices
    .filter((inv) => paymentByInvoice.get(inv.invoiceNo)?.status === "Cleared")
    .map((inv) => ({ ...inv, paymentDate: paymentByInvoice.get(inv.invoiceNo)?.clearingDate ?? null }));

  const pendingApprovalInvoices = invoices.filter((inv) => inv.approvalStatus === "Pending Approval");

  const summary =
    `Account statement for ${dateFrom} to ${dateTo}: ${invoices.length} invoice${invoices.length === 1 ? "" : "s"} ` +
    `totaling ${currency} ${totalInvoiced.toLocaleString("en-IN")}. ${currency} ${totalCleared.toLocaleString("en-IN")} cleared, ` +
    `${currency} ${totalOutstanding.toLocaleString("en-IN")} outstanding — ${currency} ${totalPayableThisMonth.toLocaleString("en-IN")} ` +
    `payable this month, ${currency} ${totalPayableThisQuarter.toLocaleString("en-IN")} this quarter. ` +
    `${pendingApprovalInvoices.length} invoice${pendingApprovalInvoices.length === 1 ? "" : "s"} pending approval.`;

  await addQueryLogEntry({
    vendorCode: vendor.vendorCode,
    vendorName: vendor.vendorName,
    queryType: "account_statement",
    reference: `${dateFrom}:${dateTo}`,
    outcome: "auto_resolved",
    responseSummary: summary,
    resolutionSeconds: (Date.now() - started) / 1000,
  });

  return {
    kind: "statement",
    summary,
    dateFrom,
    dateTo,
    currency,
    invoices,
    payments,
    agingSummary,
    totalOutstanding,
    totalPayableThisMonth,
    totalPayableThisQuarter,
    paidInvoices,
    pendingApprovalInvoices,
  };
}
