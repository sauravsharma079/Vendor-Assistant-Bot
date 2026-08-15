"use client";

import { useState, useRef, useEffect } from "react";
import type { QueryType } from "@/lib/sap/types";

type Sender = "bot" | "vendor";

interface Message {
  id: string;
  sender: Sender;
  content: React.ReactNode;
}

type Step = "identity" | "otp" | "menu" | "reference" | "done";

const QUERY_LABELS: Record<QueryType, string> = {
  invoice_status: "Invoice status",
  payment_status: "Payment status",
  form16: "Form 16 / TDS certificate",
};

const REFERENCE_PROMPTS: Record<QueryType, string> = {
  invoice_status: "What's the invoice number or PO number?",
  payment_status: "What's the invoice number? (Leave blank to see all recent payments.)",
  form16: "Which financial year? (e.g. 2025-26)",
};

const REFERENCE_PLACEHOLDERS: Record<QueryType, string> = {
  invoice_status: "e.g. 5100012345 or PO 4500009876",
  payment_status: "Invoice number, or leave blank for all",
  form16: "e.g. 2025-26",
};

let msgId = 0;
const nextId = () => `m${++msgId}`;

export function VendorChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: nextId(),
      sender: "bot",
      content:
        "Hi, I'm the Vendor Query Assistant. I can help with invoice status, payment status, and Form 16 requests \u2014 pulled live from SAP. First, let's verify who you are: enter your vendor code and PAN or GSTIN as registered in SAP.",
    },
  ]);
  const [step, setStep] = useState<Step>("identity");
  const [vendorCode, setVendorCode] = useState("");
  const [panOrGstin, setPanOrGstin] = useState("");
  const [otp, setOtp] = useState("");
  const [queryType, setQueryType] = useState<QueryType | null>(null);
  const [reference, setReference] = useState("");
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
      } else if (data.kind === "resolved") {
        pushBot(<div>{data.summary}</div>);
        pushBot(
          <button
            onClick={resetToMenu}
            className="mt-1 rounded-full border border-[#0b1f35]/15 px-3 py-1 text-xs font-medium text-[#0b1f35] hover:bg-[#0b1f35]/5"
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
            className="mt-1 rounded-full border border-[#0b1f35]/15 px-3 py-1 text-xs font-medium text-[#0b1f35] hover:bg-[#0b1f35]/5"
          >
            Ask another question
          </button>
        );
        setStep("done");
      }
    } catch {
      pushBot(<span className="text-red-700">Something went wrong reaching SAP. Please try again.</span>);
    } finally {
      setLoading(false);
      setReference("");
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
            Signed in as <b className="text-[#0b1f35]">{vendorName}</b>
          </span>
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.reload();
            }}
            className="text-[#c9852a] hover:underline"
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
                  ? "bg-[#0b1f35] text-white"
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
              className="min-w-[160px] flex-1 rounded-lg border border-black/15 px-3 py-2 text-sm outline-none focus:border-[#c9852a]"
            />
            <input
              value={panOrGstin}
              onChange={(e) => setPanOrGstin(e.target.value)}
              placeholder="PAN or GSTIN"
              className="min-w-[160px] flex-1 rounded-lg border border-black/15 px-3 py-2 text-sm outline-none focus:border-[#c9852a]"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-[#c9852a] px-4 py-2 text-sm font-medium text-white hover:bg-[#b5741f] disabled:opacity-50"
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
              className="min-w-[160px] flex-1 rounded-lg border border-black/15 px-3 py-2 text-sm outline-none focus:border-[#c9852a]"
              autoFocus
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-[#c9852a] px-4 py-2 text-sm font-medium text-white hover:bg-[#b5741f] disabled:opacity-50"
            >
              {loading ? "Verifying\u2026" : "Confirm"}
            </button>
          </form>
        )}

        {step === "menu" && (
          <div className="flex flex-wrap gap-2">
            {(Object.keys(QUERY_LABELS) as QueryType[]).map((t) => (
              <button
                key={t}
                onClick={() => handleMenuPick(t)}
                className="rounded-full border border-[#0b1f35]/15 px-4 py-2 text-sm font-medium text-[#0b1f35] hover:bg-[#0b1f35]/5"
              >
                {QUERY_LABELS[t]}
              </button>
            ))}
          </div>
        )}

        {step === "reference" && queryType && (
          <form onSubmit={handleReferenceSubmit} className="flex flex-wrap items-center gap-2">
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={REFERENCE_PLACEHOLDERS[queryType]}
              className="min-w-[220px] flex-1 rounded-lg border border-black/15 px-3 py-2 text-sm outline-none focus:border-[#c9852a]"
              autoFocus
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-[#c9852a] px-4 py-2 text-sm font-medium text-white hover:bg-[#b5741f] disabled:opacity-50"
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
