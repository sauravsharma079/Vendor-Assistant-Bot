import { Header } from "@/components/Header";
import { VendorChat } from "@/components/VendorChat";

const FAQS = [
  {
    q: "How is this different from emailing or calling business support?",
    a: "Today, vendors email or call for invoice status, payment status, and Form 16A / Form 26AS / TDS, and business support tracks each query by hand, replying over email one at a time. Here, vendors self-verify and get a live SAP answer in the portal — no inbox, no call — and only genuine exceptions reach business support, already logged with full context and an SLA clock.",
  },
  {
    q: "How is this secured?",
    a: "A two-factor identity check — vendor code + PAN/GSTIN against SAP, plus a one-time code sent to the email SAP already has on file. Every request is scoped server-side to your vendor code, so you can only ever see your own invoices, payments, and certificates. PAN, GSTIN, and email are masked everywhere they're logged or displayed, and every query and verification attempt is written to an audit trail.",
  },
  {
    q: "Is this connected to real SAP data?",
    a: "Every answer here is a real-time OData call to the connected S/4HANA sandbox — there's no sample or seeded data in this app. Use your actual vendor code and PAN/GSTIN, and real invoice/PO numbers as posted in SAP.",
  },
  {
    q: "What if I don't get a result?",
    a: "If the assistant reports it isn't connected to SAP yet, or a record can't be found, that reflects the live system — check with business support or verify the reference number in SAP directly.",
  },
];

export default function VendorPortalPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header active="portal" />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#C9A227]">
            Intelligent Vendor Query Resolution Platform
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-[#0f1729]">
            Get invoice, payment &amp; Form 16A / Form 26AS / TDS answers instantly
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-[#5b6b7c]">
            Verify your vendor code, pick what you need, and get an answer straight from SAP —
            instead of emailing or calling business support and waiting for a reply.
          </p>
        </div>

        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          {[
            {
              n: "1",
              t: "Verify",
              d: "Vendor code + PAN/GSTIN checked against the SAP vendor master, then a one-time code to the email on file.",
            },
            {
              n: "2",
              t: "Ask",
              d: "Pick invoice status, payment status, or Form 16A / Form 26AS / TDS.",
            },
            {
              n: "3",
              t: "Get an answer",
              d: "A live SAP lookup resolves it on the spot — or opens a tracked ticket if it needs a person.",
            },
          ].map((s) => (
            <div key={s.n} className="rounded-2xl border border-black/10 bg-white p-5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0f1729] font-display text-xs font-semibold text-white">
                {s.n}
              </div>
              <p className="mt-3 text-sm font-semibold text-[#0f1729]">{s.t}</p>
              <p className="mt-1 text-[13px] text-[#5b6b7c]">{s.d}</p>
            </div>
          ))}
        </div>

        <VendorChat />

        <div className="mt-12">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#5b6b7c]">FAQ</p>
          <h2 className="mt-1 font-display text-lg font-semibold text-[#0f1729]">Frequently asked questions</h2>
          <div className="mt-4 divide-y divide-black/10 rounded-2xl border border-black/10 bg-white">
            {FAQS.map((item) => (
              <details key={item.q} className="group px-5 py-4 open:pb-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-[#0f1729]">
                  {item.q}
                  <span className="shrink-0 text-[#C9A227] transition group-open:rotate-45">&#43;</span>
                </summary>
                <p className="mt-2 text-[13px] leading-relaxed text-[#5b6b7c]">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
