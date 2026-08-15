import { Header } from "@/components/Header";
import { AdminDashboard } from "@/components/AdminDashboard";

export default function AdminPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header active="admin" />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#c9852a]">
            Business support &middot; Vendor query resolution
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-[#0b1f35]">
            No more tracking queries by hand
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[#5b6b7c]">
            Every vendor query is logged here automatically — the ones the assistant resolved on the
            spot, and the exceptions that need a person, each with an SLA clock and full context
            already attached. Nothing to triage in an inbox.
          </p>
          <p className="mt-2 text-xs text-[#5b6b7c]">
            This dashboard is access-controlled and every sign-in and ticket action is written to
            the audit trail.
          </p>
        </div>
        <AdminDashboard />
      </main>
    </div>
  );
}
