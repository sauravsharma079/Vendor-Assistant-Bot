import { Header } from "@/components/Header";
import { AdminDashboard } from "@/components/AdminDashboard";

export default function AdminPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header active="admin" />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h1 className="font-display text-xl font-semibold text-[#0f1729]">Business Support</h1>
          <p className="text-[11px] text-[#5b6b7c]">Every sign-in and ticket action is audit-logged.</p>
        </div>
        <AdminDashboard />
      </main>
    </div>
  );
}
