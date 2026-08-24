"use client";

import { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import type { QueryType, InvoiceStatusResult, PaymentStatusResult } from "@/lib/sap/types";
import type { AgingBucket } from "@/lib/resolver";

type Sender = "bot" | "vendor";

interface Message {
  id: string;
  sender: Sender;
  content: React.ReactNode;
}

type Step = "identity" | "otp" | "menu" | "reference" | "done";

// The menu only ever offers these four — general_inquiry is reached
// exclusively through the AI free-text layer (see resolveGeneralInquiry
// in lib/resolver.ts), never a button, so it's excluded here.
const MENU_QUERY_TYPES: QueryType[] = ["invoice_status", "payment_status", "form16", "account_statement"];

const QUERY_LABELS: Record<QueryType, string> = {
  invoice_status: "Invoice status",
  payment_status: "Payment status",
  form16: "Form 16A / Form 26AS / TDS",
  account_statement: "Account statement",
  general_inquiry: "General inquiry",
};

const REFERENCE_PROMPTS: Record<QueryType, string> = {
  invoice_status: "What's the invoice number or PO number?",
  payment_status: "What's the invoice number? (Leave blank to see all recent payments.)",
  form16: "Which financial year? (e.g. 2025-26)",
  account_statement: "Which date range? (e.g. 2025-04-01:2026-03-31, or leave blank for the current financial year)",
  general_inquiry: "What do you need help with?",
};

const REFERENCE_PLACEHOLDERS: Record<QueryType, string> = {
  invoice_status: "e.g. 5100012345 or PO 4500009876",
  payment_status: "Invoice number, or leave blank for all",
  form16: "e.g. 2025-26",
  account_statement: "e.g. 2025-04-01:2026-03-31",
  general_inquiry: "Briefly describe what you need",
};

let msgId = 0;
const nextId = () => `m${++msgId}`;

// Shown under every resolved/statement answer so a vendor who isn't fully
// satisfied can open a ticket (with their own description) instead of the
// conversation just ending. Self-contained: manages its own asking ->
// describing -> submitted states and reports the outcome back via
// onSettled so it can be rendered as a normal chat bubble.
function FollowUpPrompt({
  queryType,
  reference,
  onSettled,
}: {
  queryType: QueryType;
  reference: string;
  onSettled: (content: React.ReactNode) => void;
}) {
  const [mode, setMode] = useState<"asking" | "describing" | "submitting">("asking");
  const [description, setDescription] = useState("");

  async function submitTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    setMode("submitting");
    try {
      const res = await fetch("/api/follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queryType, reference, description: description.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        onSettled(<span className="text-red-700">{data.error || "Couldn't open a ticket right now. Please try again."}</span>);
      } else {
        onSettled(
          <div>
            <p>{data.summary}</p>
            <p className="mt-1 text-xs text-[#5b6b7c]">
              Reference this ticket ID with business support if you follow up: <b>{data.ticketId}</b>
            </p>
          </div>
        );
      }
    } catch {
      onSettled(<span className="text-red-700">Something went wrong opening the ticket. Please try again.</span>);
    }
  }

  if (mode === "asking") {
    return (
      <div className="mt-2">
        <p className="text-xs text-[#5b6b7c]">Still need help with this?</p>
        <div className="mt-1.5 flex gap-2">
          <button
            onClick={() => onSettled(<span className="text-xs text-[#5b6b7c]">Marked as resolved — glad we could help!</span>)}
            className="rounded-full border border-[#0f1729]/15 px-3 py-1 text-xs font-medium text-[#0f1729] hover:bg-[#0f1729]/5"
          >
            Mark as resolved
          </button>
          <button
            onClick={() => setMode("describing")}
            className="rounded-full border border-[#0f1729]/15 px-3 py-1 text-xs font-medium text-[#0f1729] hover:bg-[#0f1729]/5"
          >
            I still need help
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submitTicket} className="mt-2">
      <p className="text-xs text-[#5b6b7c]">Briefly describe what you still need help with:</p>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        disabled={mode === "submitting"}
        placeholder="e.g. This is marked Approved but I still haven't received payment"
        className="mt-1 w-full rounded-lg border border-black/10 px-2.5 py-1.5 text-xs focus:border-[#C9A227] focus:outline-none disabled:opacity-60"
      />
      <div className="mt-1.5 flex gap-2">
        <button
          type="submit"
          disabled={mode === "submitting" || !description.trim()}
          className="rounded-full bg-[#C9A227] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#A9860E] disabled:opacity-50"
        >
          {mode === "submitting" ? "Opening ticket…" : "Open ticket"}
        </button>
        <button
          type="button"
          disabled={mode === "submitting"}
          onClick={() => {
            setDescription("");
            setMode("asking");
          }}
          className="rounded-full border border-[#0f1729]/15 px-3 py-1.5 text-xs font-medium text-[#0f1729] hover:bg-[#0f1729]/5 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// Shown when the AI layer recognizes a request outside self-service scope
// (general_inquiry) — the vendor's own message is pre-filled and editable,
// and nothing is sent to Business Support until they explicitly submit.
function ConfirmTicketPrompt({
  initialText,
  onSettled,
}: {
  initialText: string;
  onSettled: (content: React.ReactNode) => void;
}) {
  const [description, setDescription] = useState(initialText);
  const [submitting, setSubmitting] = useState(false);

  async function submitTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queryType: "general_inquiry", reference: description.trim(), description: description.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        onSettled(<span className="text-red-700">{data.error || "Couldn't send that right now. Please try again."}</span>);
      } else {
        onSettled(
          <div>
            <p>{data.summary}</p>
            <p className="mt-1 text-xs text-[#5b6b7c]">
              Reference this ticket ID with business support if you follow up: <b>{data.ticketId}</b>
            </p>
          </div>
        );
      }
    } catch {
      onSettled(<span className="text-red-700">Something went wrong sending that. Please try again.</span>);
    }
  }

  return (
    <form onSubmit={submitTicket} className="mt-1">
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        disabled={submitting}
        className="mt-1 w-full rounded-lg border border-black/10 px-2.5 py-1.5 text-xs focus:border-[#C9A227] focus:outline-none disabled:opacity-60"
      />
      <div className="mt-1.5 flex gap-2">
        <button
          type="submit"
          disabled={submitting || !description.trim()}
          className="rounded-full bg-[#C9A227] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#A9860E] disabled:opacity-50"
        >
          {submitting ? "Sending…" : "Send to Business Support"}
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => onSettled(<span className="text-xs text-[#5b6b7c]">No problem — let me know if there's anything else I can help with.</span>)}
          className="rounded-full border border-[#0f1729]/15 px-3 py-1.5 text-xs font-medium text-[#0f1729] hover:bg-[#0f1729]/5 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

interface StatementData {
  dateFrom: string;
  dateTo: string;
  currency: string;
  invoices: InvoiceStatusResult[];
  payments: PaymentStatusResult[];
  agingSummary: AgingBucket[];
  totalOutstanding: number;
  totalPayableThisMonth: number;
  totalPayableThisQuarter: number;
  paidInvoices: (InvoiceStatusResult & { paymentDate: string | null })[];
  pendingApprovalInvoices: InvoiceStatusResult[];
}

function sheet(rows: Record<string, unknown>[]) {
  return XLSX.utils.json_to_sheet(rows);
}

function downloadStatementExcel(s: StatementData) {
  const { dateFrom, dateTo, currency } = s;
  const totalInvoiced = s.invoices.reduce((sum, i) => sum + i.amount, 0);
  const totalCleared = s.paidInvoices.reduce((sum, i) => sum + i.amount, 0);
  const wb = XLSX.utils.book_new();

  // Summary — headline totals + aging buckets, the "at a glance" sheet.
  XLSX.utils.book_append_sheet(
    wb,
    sheet([
      { Metric: "Statement period", Value: `${dateFrom} to ${dateTo}` },
      { Metric: "Total invoices", Value: s.invoices.length },
      { Metric: "Total invoiced", Value: `${currency} ${totalInvoiced.toLocaleString("en-IN")}` },
      { Metric: "Total cleared", Value: `${currency} ${totalCleared.toLocaleString("en-IN")}` },
      { Metric: "Total outstanding", Value: `${currency} ${s.totalOutstanding.toLocaleString("en-IN")}` },
      { Metric: "Payable this month", Value: `${currency} ${s.totalPayableThisMonth.toLocaleString("en-IN")}` },
      { Metric: "Payable this quarter", Value: `${currency} ${s.totalPayableThisQuarter.toLocaleString("en-IN")}` },
      { Metric: "Pending approval", Value: s.pendingApprovalInvoices.length },
      {},
      { Metric: "Aging bucket", Value: "Count / Amount" },
      ...s.agingSummary.map((a) => ({ Metric: a.bucket, Value: `${a.count} / ${currency} ${a.amount.toLocaleString("en-IN")}` })),
    ]),
    "Summary"
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      s.invoices.map((inv) => ({
        "Invoice No": inv.invoiceNo,
        "PO Number": inv.poNumber,
        "Posting Date": inv.postingDate,
        Status: inv.approvalStatus,
        "GRN Matched": inv.grnMatched ? "Yes" : "No",
        Amount: inv.amount,
        Currency: inv.currency,
        "Block Reason": inv.blockReason ?? "",
      }))
    ),
    "Invoices Submitted"
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      s.paidInvoices.map((inv) => ({
        "Invoice No": inv.invoiceNo,
        "PO Number": inv.poNumber,
        "Posting Date": inv.postingDate,
        "Payment Date": inv.paymentDate ?? "",
        Amount: inv.amount,
        Currency: inv.currency,
      }))
    ),
    "Invoices Paid"
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      s.pendingApprovalInvoices.map((inv) => ({
        "Invoice No": inv.invoiceNo,
        "PO Number": inv.poNumber,
        "Posting Date": inv.postingDate,
        Amount: inv.amount,
        Currency: inv.currency,
      }))
    ),
    "Pending Approval"
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      s.payments.map((p) => ({
        "Invoice No": p.invoiceNo,
        "Payment Doc No": p.paymentDocNo ?? "",
        Status: p.status,
        "Clearing Date": p.clearingDate ?? "",
        "Scheduled Date": p.scheduledDate ?? "",
        Amount: p.amount,
        Currency: p.currency,
        "Bank Reference": p.bankReference ?? "",
        "Hold Reason": p.holdReason ?? "",
      }))
    ),
    "Payments"
  );

  XLSX.writeFile(wb, `account-statement-${dateFrom}-to-${dateTo}.xlsx`);
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// A labeled summary card replaces the dense run-on sentence the raw
// resolver summary would otherwise read as — the same figures, laid out
// so each one is scannable rather than crammed into one sentence.
function StatementSummaryCard({ s }: { s: StatementData }) {
  const totalInvoiced = s.invoices.reduce((sum, i) => sum + i.amount, 0);
  const totalCleared = s.paidInvoices.reduce((sum, i) => sum + i.amount, 0);
  const money = (n: number) => `${s.currency} ${n.toLocaleString("en-IN")}`;

  const rows: [string, string][] = [
    ["Period", `${formatDateShort(s.dateFrom)} – ${formatDateShort(s.dateTo)}`],
    ["Total invoiced", `${money(totalInvoiced)} (${s.invoices.length} invoice${s.invoices.length === 1 ? "" : "s"})`],
    ["Cleared", money(totalCleared)],
    ["Outstanding", money(s.totalOutstanding)],
    ["Payable this month", money(s.totalPayableThisMonth)],
    ["Payable this quarter", money(s.totalPayableThisQuarter)],
    ["Pending approval", `${s.pendingApprovalInvoices.length} invoice${s.pendingApprovalInvoices.length === 1 ? "" : "s"}`],
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-black/10">
      <div className="bg-[#0f1729] px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#C9A227]">Account Statement</p>
      </div>
      <div className="divide-y divide-black/5 bg-white">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between px-4 py-2 text-sm">
            <span className="text-[#5b6b7c]">{label}</span>
            <span className="font-medium text-[#0f1729]">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function VendorChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: nextId(),
      sender: "bot",
      content:
        "Hi, I'm the Vendor Query Assistant. I can help with invoice status, payment status, and Form 16A / Form 26AS / TDS requests \u2014 pulled live from SAP. First, let's verify who you are: enter your vendor code and PAN or GSTIN as registered in SAP.",
    },
  ]);
  const [step, setStep] = useState<Step>("identity");
  const [vendorCode, setVendorCode] = useState("");
  const [panOrGstin, setPanOrGstin] = useState("");
  const [otp, setOtp] = useState("");
  const [queryType, setQueryType] = useState<QueryType | null>(null);
  const [reference, setReference] = useState("");
  const [aiQuestion, setAiQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [vendorName, setVendorName] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Restore an existing session on load, so a refresh doesn't force re-verification.
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated) {
          setVendorName(data.vendorName);
          setStep("menu");
          pushBot(`Welcome back, ${data.vendorName}. What would you like to check?`);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pushBot(content: React.ReactNode) {
    setMessages((m) => [...m, { id: nextId(), sender: "bot", content }]);
  }
  function pushVendor(content: React.ReactNode) {
    setMessages((m) => [...m, { id: nextId(), sender: "vendor", content }]);
  }

  async function handleIdentitySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vendorCode.trim() || !panOrGstin.trim()) return;
    pushVendor(
      <span>
        Vendor code <b>{vendorCode}</b>, PAN/GSTIN <b>{"*".repeat(Math.max(panOrGstin.length - 4, 0))}{panOrGstin.slice(-4)}</b>
      </span>
    );
    setLoading(true);
    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorCode, panOrGstin }),
      });
      const data = await res.json();
      if (!res.ok) {
        pushBot(<span className="text-red-700">{data.error}</span>);
      } else {
        pushBot(
          <span>
            Thanks. We've sent a 6-digit code to <b>{data.maskedEmail}</b> (the email on file in SAP). Enter it
            below — it expires in 5 minutes.
          </span>
        );
        setStep("otp");
      }
    } catch {
      pushBot(<span className="text-red-700">Something went wrong reaching the verification service. Please try again.</span>);
    } finally {
      setLoading(false);
    }
  }

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!otp.trim()) return;
    pushVendor(otp);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorCode, otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        pushBot(<span className="text-red-700">{data.error}</span>);
        setOtp("");
      } else {
        setVendorName(data.vendorName);
        pushBot(`Verified. Hi ${data.vendorName} \u2014 what would you like to check?`);
        setStep("menu");
        setPanOrGstin("");
      }
    } catch {
      pushBot(<span className="text-red-700">Something went wrong verifying that code. Please try again.</span>);
    } finally {
      setLoading(false);
    }
  }

  function handleMenuPick(type: QueryType) {
    setQueryType(type);
    pushVendor(QUERY_LABELS[type]);
    setStep("reference");
    pushBot(REFERENCE_PROMPTS[type]);
  }

  // Shared by the menu-driven flow and the AI free-text flow — both end up
  // calling the same resolveQuery() on the server, so both render the same
  // result the same way. queryType/reference (the ones actually resolved,
  // which for the AI flow may differ from client-side state) are what the
  // "still need help?" follow-up ticket is filed against.
  function pushResolveResult(
    data: { kind: string; summary?: string; ticketId?: string } & Partial<StatementData>,
    resolvedQueryType: QueryType | null,
    resolvedReference: string
  ) {
    function pushFollowUp() {
      if (!resolvedQueryType) return;
      const msgIdForFollowUp = nextId();
      setMessages((m) => [
        ...m,
        {
          id: msgIdForFollowUp,
          sender: "bot",
          content: (
            <FollowUpPrompt
              queryType={resolvedQueryType}
              reference={resolvedReference}
              onSettled={(content) =>
                setMessages((m2) => m2.map((msg) => (msg.id === msgIdForFollowUp ? { ...msg, content } : msg)))
              }
            />
          ),
        },
      ]);
    }

    if (data.kind === "statement") {
      const statement: StatementData = {
        dateFrom: data.dateFrom ?? "",
        dateTo: data.dateTo ?? "",
        currency: data.currency ?? "INR",
        invoices: data.invoices ?? [],
        payments: data.payments ?? [],
        agingSummary: data.agingSummary ?? [],
        totalOutstanding: data.totalOutstanding ?? 0,
        totalPayableThisMonth: data.totalPayableThisMonth ?? 0,
        totalPayableThisQuarter: data.totalPayableThisQuarter ?? 0,
        paidInvoices: data.paidInvoices ?? [],
        pendingApprovalInvoices: data.pendingApprovalInvoices ?? [],
      };
      pushBot(
        <div>
          <StatementSummaryCard s={statement} />
          <button
            onClick={() => downloadStatementExcel(statement)}
            className="mt-2 rounded-full bg-[#C9A227] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#A9860E]"
          >
            Download statement (Excel)
          </button>
        </div>
      );
      pushFollowUp();
      pushBot(
        <button
          onClick={resetToMenu}
          className="mt-1 rounded-full border border-[#0f1729]/15 px-3 py-1 text-xs font-medium text-[#0f1729] hover:bg-[#0f1729]/5"
        >
          Ask another question
        </button>
      );
      setStep("done");
    } else if (data.kind === "resolved") {
      pushBot(<div>{data.summary}</div>);
      pushFollowUp();
      pushBot(
        <button
          onClick={resetToMenu}
          className="mt-1 rounded-full border border-[#0f1729]/15 px-3 py-1 text-xs font-medium text-[#0f1729] hover:bg-[#0f1729]/5"
        >
          Ask another question
        </button>
      );
      setStep("done");
    } else if (data.kind === "escalated") {
      pushBot(
        <div>
          <p>{data.summary}</p>
          <p className="mt-1 text-xs text-[#5b6b7c]">
            Reference this ticket ID with business support if you follow up: <b>{data.ticketId}</b>
          </p>
        </div>
      );
      pushBot(
        <button
          onClick={resetToMenu}
          className="mt-1 rounded-full border border-[#0f1729]/15 px-3 py-1 text-xs font-medium text-[#0f1729] hover:bg-[#0f1729]/5"
        >
          Ask another question
        </button>
      );
      setStep("done");
    }
  }

  async function handleReferenceSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!queryType) return;
    pushVendor(reference.trim() ? reference : <i>(none provided)</i>);
    setLoading(true);
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queryType, reference }),
      });
      const data = await res.json();

      if (res.status === 401) {
        pushBot(<span className="text-red-700">Your session has expired. Please verify again.</span>);
        setStep("identity");
        setVendorCode("");
        setVendorName(null);
      } else if (data.kind === "system_error") {
        pushBot(<div className="text-red-700">{data.message}</div>);
        setStep("done");
      } else {
        pushResolveResult(data, queryType, reference);
      }
    } catch {
      pushBot(<span className="text-red-700">Something went wrong reaching SAP. Please try again.</span>);
    } finally {
      setLoading(false);
      setReference("");
    }
  }

  async function handleAiQuestionSubmit(e: React.FormEvent) {
    e.preventDefault();
    const question = aiQuestion.trim();
    if (!question) return;
    pushVendor(question);
    setAiQuestion("");
    setLoading(true);
    try {
      const res = await fetch("/api/ai-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question }),
      });
      const data = await res.json();

      if (res.status === 401) {
        pushBot(<span className="text-red-700">Your session has expired. Please verify again.</span>);
        setStep("identity");
        setVendorCode("");
        setVendorName(null);
      } else if (!res.ok) {
        // Covers "not configured" (503), a Groq failure (502), or anything
        // else — always show *something* rather than failing silently.
        pushBot(
          <span className="text-red-700">
            {data?.error || "Something went wrong reaching the assistant. Please try again or use the buttons below."}
          </span>
        );
      } else if (data.kind === "clarify") {
        pushBot(<div>{data.message}</div>);
      } else if (data.kind === "confirm_ticket") {
        const confirmMsgId = nextId();
        setMessages((m) => [
          ...m,
          {
            id: confirmMsgId,
            sender: "bot",
            content: (
              <div>
                <p>{data.message}</p>
                <ConfirmTicketPrompt
                  initialText={data.reference ?? ""}
                  onSettled={(content) =>
                    setMessages((m2) => m2.map((msg) => (msg.id === confirmMsgId ? { ...msg, content } : msg)))
                  }
                />
              </div>
            ),
          },
          {
            id: nextId(),
            sender: "bot",
            content: (
              <button
                onClick={resetToMenu}
                className="mt-1 rounded-full border border-[#0f1729]/15 px-3 py-1 text-xs font-medium text-[#0f1729] hover:bg-[#0f1729]/5"
              >
                Ask another question
              </button>
            ),
          },
        ]);
        setStep("done");
      } else if (data.kind === "system_error") {
        pushBot(<div className="text-red-700">{data.message}</div>);
        setStep("done");
      } else {
        pushResolveResult(data, data.queryType ?? null, data.reference ?? "");
      }
    } catch {
      pushBot(<span className="text-red-700">Something went wrong reaching the assistant. Please try again.</span>);
    } finally {
      setLoading(false);
    }
  }

  function resetToMenu() {
    setQueryType(null);
    setStep("menu");
    pushBot("Anything else?");
  }

  return (
    <div className="flex h-[600px] flex-col rounded-2xl border border-black/10 bg-white shadow-sm">
      {vendorName && (
        <div className="flex items-center justify-between border-b border-black/5 bg-[#f6f7f9] px-4 py-2 text-xs text-[#5b6b7c]">
          <span>
            Signed in as <b className="text-[#0f1729]">{vendorName}</b>
          </span>
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.reload();
            }}
            className="text-[#C9A227] hover:underline"
          >
            Sign out
          </button>
        </div>
      )}
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.sender === "vendor" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed ${
                m.sender === "vendor"
                  ? "bg-[#0f1729] text-white"
                  : "bg-[#f6f7f9] text-[#16212e] border border-black/5"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-black/5 bg-[#f6f7f9] px-4 py-2.5 text-[14px] text-[#5b6b7c]">
              Working&hellip;
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-black/10 p-4">
        {step === "identity" && (
          <form onSubmit={handleIdentitySubmit} className="flex flex-wrap items-center gap-2">
            <input
              value={vendorCode}
              onChange={(e) => setVendorCode(e.target.value)}
              placeholder="Vendor code (as in SAP)"
              className="min-w-[160px] flex-1 rounded-lg border border-black/15 px-3 py-2 text-sm outline-none focus:border-[#C9A227]"
            />
            <input
              value={panOrGstin}
              onChange={(e) => setPanOrGstin(e.target.value)}
              placeholder="PAN or GSTIN"
              className="min-w-[160px] flex-1 rounded-lg border border-black/15 px-3 py-2 text-sm outline-none focus:border-[#C9A227]"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-[#C9A227] px-4 py-2 text-sm font-medium text-white hover:bg-[#A9860E] disabled:opacity-50"
            >
              {loading ? "Checking\u2026" : "Verify"}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleOtpSubmit} className="flex flex-wrap items-center gap-2">
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="6-digit code"
              inputMode="numeric"
              className="min-w-[160px] flex-1 rounded-lg border border-black/15 px-3 py-2 text-sm outline-none focus:border-[#C9A227]"
              autoFocus
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-[#C9A227] px-4 py-2 text-sm font-medium text-white hover:bg-[#A9860E] disabled:opacity-50"
            >
              {loading ? "Verifying\u2026" : "Confirm"}
            </button>
          </form>
        )}

        {step === "menu" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {MENU_QUERY_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => handleMenuPick(t)}
                  className="rounded-full border border-[#0f1729]/15 px-4 py-2 text-sm font-medium text-[#0f1729] hover:bg-[#0f1729]/5"
                >
                  {QUERY_LABELS[t]}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-black/10" />
              <span className="text-[11px] text-[#5b6b7c]">or just ask</span>
              <div className="h-px flex-1 bg-black/10" />
            </div>
            <form onSubmit={handleAiQuestionSubmit} className="flex flex-wrap items-center gap-2">
              <input
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                placeholder="e.g. Has invoice 5100012345 been paid yet?"
                className="min-w-[220px] flex-1 rounded-lg border border-black/15 px-3 py-2 text-sm outline-none focus:border-[#C9A227]"
              />
              <button
                type="submit"
                disabled={loading || !aiQuestion.trim()}
                className="rounded-lg bg-[#C9A227] px-4 py-2 text-sm font-medium text-white hover:bg-[#A9860E] disabled:opacity-50"
              >
                {loading ? "Asking…" : "Ask"}
              </button>
            </form>
          </div>
        )}

        {step === "reference" && queryType && (
          <form onSubmit={handleReferenceSubmit} className="flex flex-wrap items-center gap-2">
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={REFERENCE_PLACEHOLDERS[queryType]}
              className="min-w-[220px] flex-1 rounded-lg border border-black/15 px-3 py-2 text-sm outline-none focus:border-[#C9A227]"
              autoFocus
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-[#C9A227] px-4 py-2 text-sm font-medium text-white hover:bg-[#A9860E] disabled:opacity-50"
            >
              {loading ? "Checking\u2026" : "Send"}
            </button>
          </form>
        )}

        {step === "done" && (
          <p className="text-center text-xs text-[#5b6b7c]">Use the button above to ask another question.</p>
        )}
      </div>
    </div>
  );
}
