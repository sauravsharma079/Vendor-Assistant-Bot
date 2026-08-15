"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Ticket, QueryLogEntry, AuditLogEntry } from "@/lib/store/types";

type Tab = "tickets" | "log" | "audit";

export function AdminDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("tickets");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [queryLog, setQueryLog] = useState<QueryLogEntry[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [t, q, a] = await Promise.all([
      fetch("/api/tickets").then((r) => r.json()),
      fetch("/api/query-log").then((r) => r.json()),
      fetch("/api/audit-log").then((r) => r.json()),
    ]);
    setTickets(t.tickets ?? []);
    setQueryLog(q.queryLog ?? []);
    setAuditLog(a.auditLog ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openTickets = tickets.filter((t) => t.status !== "resolved");
  const autoResolved = queryLog.filter((q) => q.outcome === "auto_resolved").length;
  const escalated = queryLog.filter((q) => q.outcome === "escalated").length;
  const total = queryLog.length;
  const autoRate = total > 0 ? Math.round((autoResolved / total) * 100) : 0;
  const avgResolutionSecs =
    total > 0 ? Math.round(queryLog.reduce((s, q) => s + q.resolutionSeconds, 0) / total) : 0;

  async function setStatus(id: string, status: Ticket["status"]) {
    await fetch("/api/tickets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    refresh();
  }

  async function signOut() {
    await fetch("/api/admin-auth/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button onClick={signOut} className="text-xs font-medium text-[#c9852a] hover:underline">
          Sign out
        </button>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[#5b6b7c]">Impact so far</p>
        <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Total queries" value={String(total)} />
          <StatCard
            label="Auto-resolved"
            value={`${autoRate}%`}
            sub={`${autoResolved} of ${total} — no email, no wait`}
            tone={total > 0 ? "positive" : "neutral"}
          />
          <StatCard
            label="Open tickets"
            value={String(openTickets.length)}
            tone={openTickets.length > 0 ? "warning" : "neutral"}
          />
          <StatCard label="Avg. resolution" value={total > 0 ? `${avgResolutionSecs}s` : "—"} sub="vs. hours/days by email" />
        </div>
        {total === 0 && (
          <p className="mt-2 text-[11px] text-[#5b6b7c]">
            No queries yet — these numbers populate live as vendors use the portal.
          </p>
        )}
      </div>

      <div className="flex gap-1 rounded-full bg-black/5 p-1 text-sm w-fit">
        {(["tickets", "log", "audit"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 capitalize transition ${
              tab === t ? "bg-white shadow-sm text-[#0b1f35]" : "text-[#5b6b7c] hover:text-[#0b1f35]"
            }`}
          >
            {t === "log" ? "Query log" : t === "audit" ? "Audit trail" : "Tickets"}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-[#5b6b7c]">Loading&hellip;</p>
      ) : tab === "tickets" ? (
        <TicketsTable tickets={tickets} onStatusChange={setStatus} />
      ) : tab === "log" ? (
        <QueryLogTable entries={queryLog} />
      ) : (
        <AuditTable entries={auditLog} />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "positive" | "warning";
}) {
  const valueColor =
    tone === "positive" ? "text-emerald-600" : tone === "warning" ? "text-[#c9852a]" : "text-[#0b1f35]";
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[#5b6b7c]">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold ${valueColor}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-[#5b6b7c]">{sub}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: Ticket["status"] }) {
  const map = {
    open: "bg-red-50 text-red-700 border-red-200",
    in_progress: "bg-amber-50 text-amber-700 border-amber-200",
    resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  const label = { open: "Open", in_progress: "In progress", resolved: "Resolved" }[status];
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${map[status]}`}>{label}</span>;
}

function TicketsTable({ tickets, onStatusChange }: { tickets: Ticket[]; onStatusChange: (id: string, s: Ticket["status"]) => void }) {
  if (tickets.length === 0) {
    return <EmptyState text="No exception tickets yet. Escalated vendor queries will show up here." />;
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-black/10 bg-white">
      <table className="w-full text-left text-[13px]">
        <thead className="bg-[#f6f7f9] text-[11px] uppercase tracking-wide text-[#5b6b7c]">
          <tr>
            <th className="px-4 py-3">Vendor</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Reference</th>
            <th className="px-4 py-3">Reason</th>
            <th className="px-4 py-3">SLA due</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
            <tr key={t.id} className="border-t border-black/5">
              <td className="px-4 py-3">
                <p className="font-medium text-[#0b1f35]">{t.vendorName}</p>
                <p className="text-[11px] text-[#5b6b7c]">{t.vendorCode}</p>
              </td>
              <td className="px-4 py-3 text-[#5b6b7c]">{t.queryType.replace("_", " ")}</td>
              <td className="px-4 py-3 text-[#5b6b7c]">{t.reference ?? "\u2014"}</td>
              <td className="px-4 py-3 max-w-[220px] text-[#5b6b7c]">{t.reason}</td>
              <td className="px-4 py-3 text-[#5b6b7c]">{new Date(t.slaDueAt).toLocaleString()}</td>
              <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
              <td className="px-4 py-3">
                {t.status !== "resolved" && (
                  <div className="flex gap-1">
                    {t.status === "open" && (
                      <button
                        onClick={() => onStatusChange(t.id, "in_progress")}
                        className="rounded-full border border-black/10 px-2.5 py-1 text-[11px] hover:bg-black/5"
                      >
                        Start
                      </button>
                    )}
                    <button
                      onClick={() => onStatusChange(t.id, "resolved")}
                      className="rounded-full bg-[#0b1f35] px-2.5 py-1 text-[11px] text-white hover:bg-[#0b1f35]/85"
                    >
                      Resolve
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QueryLogTable({ entries }: { entries: QueryLogEntry[] }) {
  if (entries.length === 0) {
    return <EmptyState text="No queries logged yet. Try the vendor portal." />;
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-black/10 bg-white">
      <table className="w-full text-left text-[13px]">
        <thead className="bg-[#f6f7f9] text-[11px] uppercase tracking-wide text-[#5b6b7c]">
          <tr>
            <th className="px-4 py-3">Time</th>
            <th className="px-4 py-3">Vendor</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Outcome</th>
            <th className="px-4 py-3">Summary</th>
            <th className="px-4 py-3">Time to resolve</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-t border-black/5">
              <td className="px-4 py-3 whitespace-nowrap text-[#5b6b7c]">{new Date(e.timestamp).toLocaleString()}</td>
              <td className="px-4 py-3 text-[#0b1f35]">{e.vendorName}</td>
              <td className="px-4 py-3 text-[#5b6b7c]">{e.queryType.replace("_", " ")}</td>
              <td className="px-4 py-3">
                <OutcomeBadge outcome={e.outcome} />
              </td>
              <td className="px-4 py-3 max-w-[320px] text-[#5b6b7c]">{e.responseSummary}</td>
              <td className="px-4 py-3 text-[#5b6b7c]">{e.resolutionSeconds.toFixed(1)}s</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: QueryLogEntry["outcome"] }) {
  const map = {
    auto_resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    escalated: "bg-amber-50 text-amber-700 border-amber-200",
    verification_failed: "bg-red-50 text-red-700 border-red-200",
  };
  const label = { auto_resolved: "Auto-resolved", escalated: "Escalated", verification_failed: "Verification failed" }[outcome];
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${map[outcome]}`}>{label}</span>;
}

function AuditTable({ entries }: { entries: AuditLogEntry[] }) {
  if (entries.length === 0) {
    return <EmptyState text="No audit events yet." />;
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-black/10 bg-white">
      <table className="w-full text-left text-[13px]">
        <thead className="bg-[#f6f7f9] text-[11px] uppercase tracking-wide text-[#5b6b7c]">
          <tr>
            <th className="px-4 py-3">Time</th>
            <th className="px-4 py-3">Actor</th>
            <th className="px-4 py-3">Action</th>
            <th className="px-4 py-3">Details</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-t border-black/5">
              <td className="px-4 py-3 whitespace-nowrap text-[#5b6b7c]">{new Date(e.timestamp).toLocaleString()}</td>
              <td className="px-4 py-3 text-[#0b1f35]">{e.actor}</td>
              <td className="px-4 py-3 text-[#5b6b7c]">{e.action}</td>
              <td className="px-4 py-3 text-[#5b6b7c]">{e.details}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-black/15 bg-white p-10 text-center text-sm text-[#5b6b7c]">
      {text}
    </div>
  );
}
