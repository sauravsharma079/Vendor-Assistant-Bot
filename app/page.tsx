import { Header } from "@/components/Header";
import { VendorChat } from "@/components/VendorChat";

export default function VendorPortalPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header active="portal" />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#c9852a]">
            Vendor query resolution
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-[#0b1f35]">
            Get invoice, payment &amp; Form 16 answers instantly
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[#5b6b7c]">
            Verify your vendor code, pick what you need, and get an answer straight from SAP —
            instead of emailing or calling business support and waiting for a reply.
          </p>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-black/10 bg-white p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#5b6b7c]">Today</p>
            <ul className="mt-3 space-y-2 text-sm text-[#5b6b7c]">
              <li className="flex gap-2">
                <span className="text-red-500">&#10005;</span>
                Vendors email or call business support for invoice status, payment status, and Form 16
              </li>
              <li className="flex gap-2">
                <span className="text-red-500">&#10005;</span>
                Business support tracks each query by hand and replies over email, one at a time
              </li>
            </ul>
          </div>
          <div className="rounded-2xl border border-[#c9852a]/30 bg-[#c9852a]/[0.04] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#c9852a]">
              With this assistant
            </p>
            <ul className="mt-3 space-y-2 text-sm text-[#0b1f35]">
              <li className="flex gap-2">
                <span className="text-emerald-600">&#10003;</span>
                Vendors self-verify and get a live SAP answer in the portal — no inbox, no call
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-600">&#10003;</span>
                Only genuine exceptions reach business support, already logged with full context and an
                SLA clock
              </li>
            </ul>
          </div>
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
              d: "Pick invoice status, payment status, or Form 16 / TDS certificate.",
            },
            {
              n: "3",
              t: "Get an answer",
              d: "A live SAP lookup resolves it on the spot — or opens a tracked ticket if it needs a person.",
            },
          ].map((s) => (
            <div key={s.n} className="rounded-2xl border border-black/10 bg-white p-5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0b1f35] font-display text-xs font-semibold text-white">
                {s.n}
              </div>
              <p className="mt-3 text-sm font-semibold text-[#0b1f35]">{s.t}</p>
              <p className="mt-1 text-[13px] text-[#5b6b7c]">{s.d}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <VendorChat />

          <aside className="space-y-4">
            <div className="rounded-2xl border border-black/10 bg-white p-5 text-[13px] text-[#5b6b7c]">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#0b1f35]">
                How this is secured
              </p>
              <ul className="mt-2 space-y-2">
                <li className="flex gap-2">
                  <span className="text-[#c9852a]">&#10003;</span>
                  Two-factor identity check — vendor code + PAN/GSTIN against SAP, plus a one-time
                  code to the email SAP already has on file
                </li>
                <li className="flex gap-2">
                  <span className="text-[#c9852a]">&#10003;</span>
                  Every request is scoped server-side to your vendor code — you can only ever see
                  your own invoices, payments, and certificates
                </li>
                <li className="flex gap-2">
                  <span className="text-[#c9852a]">&#10003;</span>
                  PAN, GSTIN, and email are masked everywhere they&rsquo;re logged or displayed
                </li>
                <li className="flex gap-2">
                  <span className="text-[#c9852a]">&#10003;</span>
                  Every query and verification attempt is written to an audit trail
                </li>
              </ul>
            </div>
            <div className="rounded-2xl border border-black/10 bg-white p-5 text-[13px] text-[#5b6b7c]">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#0b1f35]">
                Live SAP connection
              </p>
              <p className="mt-2">
                Every answer here is a real-time OData call to the connected S/4HANA sandbox —
                there&rsquo;s no sample or seeded data in this app. Use your actual vendor code and
                PAN/GSTIN, and real invoice/PO numbers as posted in SAP.
              </p>
            </div>
            <div className="rounded-2xl border border-[#c9852a]/25 bg-[#c9852a]/5 p-5 text-[13px] text-[#0b1f35]">
              <p className="font-semibold">Not getting a result?</p>
              <p className="mt-1 text-[#5b6b7c]">
                If the assistant reports it isn&rsquo;t connected to SAP yet, or a record can&rsquo;t be found,
                that reflects the live system — check with business support or verify the
                reference number in SAP directly.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
