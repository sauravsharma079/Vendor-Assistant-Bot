"use client";

import { useEffect, useState, useCallback, useMemo, Fragment } from "react";
import { useRouter } from "next/navigation";
import type { Ticket, QueryLogEntry, AuditLogEntry } from "@/lib/store/types";
import { formatTicketReference } from "@/lib/ticket-ref";
import { exportAnalyticsPdf, exportAnalyticsPpt, type AnalyticsExportData } from "@/lib/analytics-export";

type Tab = "analytics" | "tickets" | "log" | "audit";

// Fixed format everywhere a timestamp is shown, so it reads the same
// regardless of the viewer's OS/browser locale (client demos have shown
// up with US-format dates otherwise).
function formatDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const NAV_ITEMS: { key: Tab; label: string }[] = [
  { key: "analytics", label: "Analytics" },
  { key: "tickets", label: "Incidents" },
  { key: "log", label: "Query Log" },
  { key: "audit", label: "Audit Trail" },
];

const TAB_TITLES: Record<Tab, { eyebrow: string; title: string }> = {
  analytics: { eyebrow: "Analytics", title: "Reporting Dashboard" },
  tickets: { eyebrow: "Incidents", title: "Incident List" },
  log: { eyebrow: "Query Log", title: "Interaction Log" },
  audit: { eyebrow: "Audit Trail", title: "System Audit Trail" },
};

const STATE_LABEL: Record<Ticket["status"], string> = { open: "New", in_progress: "In Progress", resolved: "Resolved" };
const TYPE_LABEL: Record<Ticket["queryType"], string> = {
  invoice_status: "Invoice status",
  payment_status: "Payment status",
  form16: "Form 16A / Form 26AS / TDS",
  account_statement: "Account statement",
};

// Fixed roster — there's no per-user login yet (business support shares one
// password), so assignment is to a name from this list rather than a real
// account. Swap for a real user directory once individual accounts exist.
const AGENTS = ["Priya Nair", "Rahul Mehta", "Vikram Rao", "Sanya Kapoor"];

interface SavedView {
  name: string;
  stateFilter: "all" | Ticket["status"];
  typeFilter: "all" | Ticket["queryType"];
  assigneeFilter: "all" | "unassigned" | string;
  search: string;
}

const SAVED_VIEWS_KEY = "vqa_admin_saved_views";

// "Personal" views live in this browser's localStorage — there's no
// per-user account to attach a server-side saved view to, so this is the
// honest equivalent: private to whoever is using this browser/device.
function loadSavedViews(): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SAVED_VIEWS_KEY);
    return raw ? (JSON.parse(raw) as SavedView[]) : [];
  } catch {
    return [];
  }
}

function persistSavedViews(views: SavedView[]) {
  try {
    window.localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(views));
  } catch {
    // best-effort — private browsing / storage quota, view just won't persist
  }
}

// Exports whatever rows are passed (already filtered by the caller) as a
// CSV file — opens natively in Excel, Google Sheets, Numbers, etc. A BOM
// prefix keeps Excel from mangling the em-dashes used throughout the copy.
function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

// Status colors — reserved, fixed meaning, matching the StateBadge/
// OutcomeBadge hues used elsewhere in this dashboard (not a generated
// categorical palette; each color always means the same state).
const STATE_COLOR: Record<Ticket["status"], string> = {
  open: "#2563eb",
  in_progress: "#d97706",
  resolved: "#059669",
};
const OUTCOME_COLOR: Record<QueryLogEntry["outcome"], string> = {
  auto_resolved: "#059669",
  escalated: "#d97706",
  verification_failed: "#dc2626",
};

interface BarDatum {
  label: string;
  value: number;
  color: string;
}

function BarChart({
  title,
  data,
  valueFormatter = (v: number) => String(v),
}: {
  title: string;
  data: BarDatum[];
  valueFormatter?: (v: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#5b6b7c]">{title}</p>
      {total === 0 ? (
        <p className="mt-4 text-[12px] text-[#5b6b7c]">No data yet.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {data.map((d) => {
            const pct = Math.round((d.value / max) * 100);
            return (
              <div key={d.label}>
                <div className="mb-1 flex items-center justify-between text-[12px]">
                  <span className="text-[#0f1729]">{d.label}</span>
                  <span className="font-medium text-[#0f1729]">{valueFormatter(d.value)}</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-[#f0f1f3]">
                  <div
                    className="h-full rounded-r-full transition-[width]"
                    style={{ width: `${pct}%`, backgroundColor: d.color }}
                    title={`${d.label}: ${valueFormatter(d.value)}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// A single ratio against a limit — same-ramp track (light step of the fill
// hue, not a translucent wash) so the state reads across the whole bar.
function Meter({
  label,
  pct,
  color,
  trackColor,
  sub,
}: {
  label: string;
  pct: number;
  color: string;
  trackColor: string;
  sub?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#5b6b7c]">{label}</p>
      <p className="mt-2 font-display text-4xl font-semibold" style={{ color }}>
        {clamped}%
      </p>
      <div className="mt-3 h-3 w-full rounded-full" style={{ backgroundColor: trackColor }}>
        <div className="h-full rounded-full transition-[width]" style={{ width: `${clamped}%`, backgroundColor: color }} />
      </div>
      {sub && <p className="mt-2 text-[11px] text-[#5b6b7c]">{sub}</p>}
    </div>
  );
}

// Part-to-whole — one bar, colored segments, legend below (never color-alone
// for 2+ series). A 2px surface gap separates touching segments.
function StackedBar({ title, segments }: { title: string; segments: BarDatum[] }) {
  const total = segments.reduce((s, d) => s + d.value, 0);
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#5b6b7c]">{title}</p>
      {total === 0 ? (
        <p className="mt-4 text-[12px] text-[#5b6b7c]">No data yet.</p>
      ) : (
        <>
          <div className="mt-4 flex h-4 w-full overflow-hidden rounded-full bg-[#f0f1f3]">
            {segments
              .filter((s) => s.value > 0)
              .map((s, i) => (
                <div
                  key={s.label}
                  style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color, marginLeft: i > 0 ? 2 : 0 }}
                  title={`${s.label}: ${s.value} (${Math.round((s.value / total) * 100)}%)`}
                />
              ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {segments.map((s) => (
              <div key={s.label} className="flex items-center gap-1.5 text-[11px] text-[#5b6b7c]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                {s.label} <span className="font-medium text-[#0f1729]">{s.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Compare magnitude, low → high — columns growing from a baseline, square
// at the baseline, rounded at the free end (top).
function ColumnChart({
  title,
  data,
  valueFormatter = (v: number) => String(v),
}: {
  title: string;
  data: BarDatum[];
  valueFormatter?: (v: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#5b6b7c]">{title}</p>
      {total === 0 ? (
        <p className="mt-4 text-[12px] text-[#5b6b7c]">No data yet.</p>
      ) : (
        <div className="mt-6 flex h-36 items-end justify-around gap-3">
          {data.map((d) => {
            const h = Math.round((d.value / max) * 100);
            return (
              <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <span className="text-[11px] font-medium text-[#0f1729]">{valueFormatter(d.value)}</span>
                <div
                  className="w-full max-w-[44px] rounded-t-md"
                  style={{ height: d.value > 0 ? `${Math.max(h, 4)}%` : 0, backgroundColor: d.color }}
                  title={`${d.label}: ${valueFormatter(d.value)}`}
                />
                <span className="text-center text-[11px] leading-tight text-[#5b6b7c]">{d.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Magnitude ranking — same bar mark as BarChart, with a rank badge so the
// "top N" framing reads at a glance.
function RankedBarChart({ title, data }: { title: string; data: BarDatum[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#5b6b7c]">{title}</p>
      {data.length === 0 ? (
        <p className="mt-4 text-[12px] text-[#5b6b7c]">No data yet.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {data.map((d, i) => {
            const pct = Math.round((d.value / max) * 100);
            return (
              <div key={d.label} className="flex items-center gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f0f1f3] text-[10px] font-semibold text-[#5b6b7c]">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between text-[12px]">
                    <span className="truncate text-[#0f1729]">{d.label}</span>
                    <span className="ml-2 shrink-0 font-medium text-[#0f1729]">{d.value}</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-[#f0f1f3]">
                    <div
                      className="h-full rounded-r-full transition-[width]"
                      style={{ width: `${pct}%`, backgroundColor: d.color }}
                      title={`${d.label}: ${d.value}`}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AdminDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("tickets");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [queryLog, setQueryLog] = useState<QueryLogEntry[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [stateFilter, setStateFilter] = useState<"all" | Ticket["status"]>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | Ticket["queryType"]>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<"all" | "unassigned" | string>("all");
  const [search, setSearch] = useState("");

  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [savingView, setSavingView] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [exporting, setExporting] = useState<"pdf" | "ppt" | null>(null);

  useEffect(() => {
    setSavedViews(loadSavedViews());
  }, []);

  function applyView(v: SavedView) {
    setStateFilter(v.stateFilter);
    setTypeFilter(v.typeFilter);
    setAssigneeFilter(v.assigneeFilter);
    setSearch(v.search);
  }

  function saveCurrentView() {
    const name = newViewName.trim();
    if (!name) return;
    const view: SavedView = { name, stateFilter, typeFilter, assigneeFilter, search };
    const next = [...savedViews.filter((v) => v.name !== name), view];
    setSavedViews(next);
    persistSavedViews(next);
    setNewViewName("");
    setSavingView(false);
  }

  function deleteView(name: string) {
    const next = savedViews.filter((v) => v.name !== name);
    setSavedViews(next);
    persistSavedViews(next);
  }

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
  const total = queryLog.length;
  const autoRate = total > 0 ? Math.round((autoResolved / total) * 100) : 0;
  const avgResolutionSecs =
    total > 0 ? Math.round(queryLog.reduce((s, q) => s + q.resolutionSeconds, 0) / total) : 0;

  const stateChartData: BarDatum[] = (["open", "in_progress", "resolved"] as Ticket["status"][]).map((s) => ({
    label: STATE_LABEL[s],
    value: tickets.filter((t) => t.status === s).length,
    color: STATE_COLOR[s],
  }));

  const outcomeChartData: BarDatum[] = (
    ["auto_resolved", "escalated", "verification_failed"] as QueryLogEntry["outcome"][]
  ).map((o) => ({
    label: { auto_resolved: "Auto-resolved", escalated: "Escalated", verification_failed: "Verification failed" }[o],
    value: queryLog.filter((q) => q.outcome === o).length,
    color: OUTCOME_COLOR[o],
  }));

  const typeChartData: BarDatum[] = (["invoice_status", "payment_status", "form16", "account_statement"] as Ticket["queryType"][]).map((qt) => ({
    label: TYPE_LABEL[qt],
    // Darker gold than the brand accent (#C9A227) — that shade fails the
    // 3:1 mark-vs-surface contrast check on white; this is the same darker
    // shade already used for button hover states elsewhere in the app.
    value: queryLog.filter((q) => q.queryType === qt).length,
    color: "#A9860E",
  }));

  const overdueTickets = tickets.filter((t) => t.status !== "resolved" && new Date(t.slaDueAt).getTime() < Date.now());
  const escalatedCount = queryLog.filter((q) => q.outcome === "escalated").length;
  const escalationRate = total > 0 ? Math.round((escalatedCount / total) * 100) : 0;
  const distinctVendors = new Set(queryLog.map((q) => q.vendorCode)).size;

  const avgResolutionByType: BarDatum[] = (["invoice_status", "payment_status", "form16", "account_statement"] as Ticket["queryType"][]).map((qt) => {
    const entries = queryLog.filter((q) => q.queryType === qt);
    const avg = entries.length > 0 ? entries.reduce((s, e) => s + e.resolutionSeconds, 0) / entries.length : 0;
    return { label: TYPE_LABEL[qt], value: Number(avg.toFixed(3)), color: "#0f1729" };
  });

  const topVendorsData: BarDatum[] = (() => {
    const counts = new Map<string, number>();
    queryLog.forEach((q) => counts.set(q.vendorName, (counts.get(q.vendorName) ?? 0) + 1));
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ label: name, value: count, color: "#0f1729" }));
  })();

  const filteredTickets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (stateFilter !== "all" && t.status !== stateFilter) return false;
      if (typeFilter !== "all" && t.queryType !== typeFilter) return false;
      if (assigneeFilter === "unassigned" && t.assignee) return false;
      if (assigneeFilter !== "all" && assigneeFilter !== "unassigned" && t.assignee !== assigneeFilter) return false;
      if (q) {
        const haystack = `${t.vendorName} ${t.vendorCode} ${t.reference ?? ""} ${formatTicketReference(t.id)}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [tickets, stateFilter, typeFilter, assigneeFilter, search]);

  async function setStatus(id: string, status: Ticket["status"]) {
    await fetch("/api/tickets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    refresh();
  }

  async function resolveTicket(id: string, note: string) {
    await fetch("/api/tickets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "resolved", note }),
    });
    refresh();
  }

  async function assignTicket(id: string, assignee: string | null) {
    await fetch("/api/tickets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, assignee }),
    });
    refresh();
  }

  async function signOut() {
    await fetch("/api/admin-auth/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  function exportTickets() {
    const headers = [
      "Number",
      "Caller",
      "Vendor Code",
      "Type",
      "Reference",
      "Short Description",
      "Resolution Note",
      "Priority",
      "SLA Due",
      "State",
      "Assignee",
      "Created At",
    ];
    const rows = filteredTickets.map((t) => [
      formatTicketReference(t.id),
      t.vendorName,
      t.vendorCode,
      TYPE_LABEL[t.queryType],
      t.reference ?? "",
      t.reason,
      t.resolutionNote ?? "",
      PRIORITY_BY_TYPE[t.queryType].label,
      formatDateTime(t.slaDueAt),
      STATE_LABEL[t.status],
      t.assignee ?? "Unassigned",
      formatDateTime(t.createdAt),
    ]);
    downloadCsv(`incidents-${todayStamp()}.csv`, headers, rows);
  }

  function exportQueryLog() {
    const headers = ["Time", "Vendor", "Vendor Code", "Type", "Outcome", "Summary", "Time to resolve (s)"];
    const rows = queryLog.map((e) => [
      formatDateTime(e.timestamp),
      e.vendorName,
      e.vendorCode,
      TYPE_LABEL[e.queryType],
      e.outcome,
      e.responseSummary,
      e.resolutionSeconds.toFixed(1),
    ]);
    downloadCsv(`query-log-${todayStamp()}.csv`, headers, rows);
  }

  function exportAuditLog() {
    const headers = ["Time", "Actor", "Action", "Details"];
    const rows = auditLog.map((e) => [formatDateTime(e.timestamp), e.actor, e.action, e.details]);
    downloadCsv(`audit-trail-${todayStamp()}.csv`, headers, rows);
  }

  function buildAnalyticsExportData(): AnalyticsExportData {
    return {
      generatedAt: new Date(),
      kpis: [
        { label: "Total queries", value: String(total) },
        { label: "Auto-resolved", value: `${autoRate}%`, sub: `${autoResolved} of ${total} — no email, no wait` },
        { label: "Open incidents", value: String(openTickets.length) },
        { label: "Avg. resolution", value: total > 0 ? `${avgResolutionSecs}s` : "—", sub: "vs. hours/days by email" },
        { label: "Escalation rate", value: `${escalationRate}%`, sub: `${escalatedCount} of ${total} queries` },
        { label: "Overdue incidents", value: String(overdueTickets.length), sub: "past SLA due date, not resolved" },
        { label: "Distinct vendors served", value: String(distinctVendors) },
        { label: "Total incidents", value: String(tickets.length) },
      ],
      autoResolvedPct: autoRate,
      autoResolvedSub: `${autoResolved} of ${total} queries — no human involved`,
      stateChart: stateChartData,
      outcomeChart: outcomeChartData,
      typeChart: typeChartData,
      avgResolutionChart: avgResolutionByType,
      topVendorsChart: topVendorsData,
    };
  }

  async function handleExportPdf() {
    setExporting("pdf");
    try {
      await exportAnalyticsPdf(buildAnalyticsExportData());
    } finally {
      setExporting(null);
    }
  }

  async function handleExportPpt() {
    setExporting("ppt");
    try {
      await exportAnalyticsPpt(buildAnalyticsExportData());
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="flex items-start gap-6">
      <Sidebar tab={tab} onTabChange={setTab} onSignOut={signOut} />

      <div className="min-w-0 flex-1 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5b6b7c]">
              {TAB_TITLES[tab].eyebrow}
            </p>
            <h2 className="font-display text-xl font-semibold text-[#0f1729]">{TAB_TITLES[tab].title}</h2>
          </div>
          {tab === "analytics" ? (
            <div className="flex shrink-0 gap-2">
              <button
                onClick={handleExportPdf}
                disabled={exporting !== null}
                className="rounded-full border border-[#0f1729]/15 px-3.5 py-1.5 text-[12px] font-medium text-[#0f1729] hover:bg-[#0f1729]/5 disabled:opacity-50"
              >
                {exporting === "pdf" ? "Exporting…" : "Export PDF"}
              </button>
              <button
                onClick={handleExportPpt}
                disabled={exporting !== null}
                className="rounded-full border border-[#0f1729]/15 px-3.5 py-1.5 text-[12px] font-medium text-[#0f1729] hover:bg-[#0f1729]/5 disabled:opacity-50"
              >
                {exporting === "ppt" ? "Exporting…" : "Export PPT"}
              </button>
            </div>
          ) : (
            <button
              onClick={tab === "tickets" ? exportTickets : tab === "log" ? exportQueryLog : exportAuditLog}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#0f1729]/15 px-3.5 py-1.5 text-[12px] font-medium text-[#0f1729] hover:bg-[#0f1729]/5"
            >
              Export CSV
            </button>
          )}
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
              label="Open incidents"
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

        {tab === "analytics" && (
          <>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#5b6b7c]">SLA &amp; coverage</p>
              <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <StatCard
                  label="Escalation rate"
                  value={`${escalationRate}%`}
                  sub={`${escalatedCount} of ${total} queries`}
                  tone={escalationRate > 30 ? "warning" : "neutral"}
                />
                <StatCard
                  label="Overdue incidents"
                  value={String(overdueTickets.length)}
                  sub="past SLA due date, not resolved"
                  tone={overdueTickets.length > 0 ? "warning" : "positive"}
                />
                <StatCard label="Distinct vendors served" value={String(distinctVendors)} />
                <StatCard label="Total incidents" value={String(tickets.length)} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Meter
                label="Auto-resolved"
                pct={autoRate}
                color="#059669"
                trackColor="#d1fae5"
                sub={`${autoResolved} of ${total} queries — no human involved`}
              />
              <StackedBar title="Incidents by state" segments={stateChartData} />
              <StackedBar title="Query outcomes" segments={outcomeChartData} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <ColumnChart title="Queries by type" data={typeChartData} />
              <RankedBarChart title="Top vendors by query volume" data={topVendorsData} />
            </div>

            <BarChart
              title="Avg. response time by type"
              data={avgResolutionByType}
              valueFormatter={(v) => `${v.toFixed(2)}s`}
            />
          </>
        )}

        {tab === "tickets" && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value as typeof stateFilter)}
                className="rounded-lg border border-black/15 bg-white px-3 py-1.5 text-[12px] text-[#0f1729] outline-none focus:border-[#C9A227]"
              >
                <option value="all">All states</option>
                <option value="open">New</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
              </select>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
                className="rounded-lg border border-black/15 bg-white px-3 py-1.5 text-[12px] text-[#0f1729] outline-none focus:border-[#C9A227]"
              >
                <option value="all">All types</option>
                <option value="invoice_status">Invoice status</option>
                <option value="payment_status">Payment status</option>
                <option value="form16">Form 16A / Form 26AS / TDS</option>
                <option value="account_statement">Account statement</option>
              </select>
              <select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                className="rounded-lg border border-black/15 bg-white px-3 py-1.5 text-[12px] text-[#0f1729] outline-none focus:border-[#C9A227]"
              >
                <option value="all">All assignees</option>
                <option value="unassigned">Unassigned</option>
                {AGENTS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search vendor, reference, or ticket #"
                className="min-w-[220px] flex-1 rounded-lg border border-black/15 bg-white px-3 py-1.5 text-[12px] text-[#0f1729] outline-none focus:border-[#C9A227]"
              />
              {(stateFilter !== "all" || typeFilter !== "all" || assigneeFilter !== "all" || search) && (
                <button
                  onClick={() => {
                    setStateFilter("all");
                    setTypeFilter("all");
                    setAssigneeFilter("all");
                    setSearch("");
                  }}
                  className="text-[12px] text-[#5b6b7c] hover:text-[#0f1729] hover:underline"
                >
                  Clear filters
                </button>
              )}
              <p className="ml-auto text-[11px] text-[#5b6b7c]">
                {filteredTickets.length} of {tickets.length}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium text-[#5b6b7c]">Personal views:</span>
              {savedViews.map((v) => (
                <span
                  key={v.name}
                  className="flex items-center gap-1.5 rounded-full border border-black/10 bg-white pl-2.5 pr-1.5 py-1 text-[11px]"
                >
                  <button onClick={() => applyView(v)} className="font-medium text-[#0f1729] hover:underline">
                    {v.name}
                  </button>
                  <button
                    onClick={() => deleteView(v.name)}
                    aria-label={`Delete view ${v.name}`}
                    className="text-[#5b6b7c] hover:text-red-600"
                  >
                    &times;
                  </button>
                </span>
              ))}
              {savingView ? (
                <span className="flex items-center gap-1.5">
                  <input
                    value={newViewName}
                    onChange={(e) => setNewViewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveCurrentView()}
                    placeholder="View name"
                    className="w-32 rounded-full border border-black/15 bg-white px-2.5 py-1 text-[11px] outline-none focus:border-[#C9A227]"
                    autoFocus
                  />
                  <button onClick={saveCurrentView} className="text-[11px] font-medium text-[#C9A227] hover:underline">
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setSavingView(false);
                      setNewViewName("");
                    }}
                    className="text-[11px] text-[#5b6b7c] hover:underline"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setSavingView(true)}
                  className="text-[11px] text-[#5b6b7c] hover:text-[#0f1729] hover:underline"
                >
                  + Save current filters as a view
                </button>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-[#5b6b7c]">Loading&hellip;</p>
        ) : tab === "tickets" ? (
          <TicketsTable
            tickets={filteredTickets}
            onStatusChange={setStatus}
            onResolve={resolveTicket}
            onAssign={assignTicket}
          />
        ) : tab === "log" ? (
          <QueryLogTable entries={queryLog} />
        ) : tab === "audit" ? (
          <AuditTable entries={auditLog} />
        ) : null}
      </div>
    </div>
  );
}

function Sidebar({
  tab,
  onTabChange,
  onSignOut,
}: {
  tab: Tab;
  onTabChange: (t: Tab) => void;
  onSignOut: () => void;
}) {
  return (
    <aside className="sticky top-6 hidden w-52 shrink-0 rounded-2xl bg-[#14171b] p-3 text-white sm:block">
      <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">Service Desk</p>
      <nav className="space-y-0.5">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => onTabChange(item.key)}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition ${
              tab === item.key ? "bg-[#C9A227]/15 font-medium text-[#F2D680]" : "text-white/70 hover:bg-white/5 hover:text-white"
            }`}
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tab === item.key ? "bg-[#F2D680]" : "bg-white/20"}`} />
            {item.label}
          </button>
        ))}
      </nav>
      <div className="mt-6 border-t border-white/10 pt-3">
        <button
          onClick={onSignOut}
          className="w-full rounded-lg px-3 py-2 text-left text-[13px] text-white/60 transition hover:bg-white/5 hover:text-white"
        >
          Sign out
        </button>
      </div>
    </aside>
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
    tone === "positive" ? "text-emerald-600" : tone === "warning" ? "text-orange-600" : "text-[#0f1729]";
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[#5b6b7c]">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold ${valueColor}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-[#5b6b7c]">{sub}</p>}
    </div>
  );
}

function StateBadge({ status }: { status: Ticket["status"] }) {
  const map = {
    open: "bg-blue-50 text-blue-700 border-blue-200",
    in_progress: "bg-amber-50 text-amber-700 border-amber-200",
    resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${map[status]}`}>{STATE_LABEL[status]}</span>;
}

const PRIORITY_BY_TYPE: Record<Ticket["queryType"], { label: string; className: string }> = {
  invoice_status: { label: "2 - High", className: "bg-orange-50 text-orange-700 border-orange-200" },
  payment_status: { label: "2 - High", className: "bg-orange-50 text-orange-700 border-orange-200" },
  form16: { label: "3 - Moderate", className: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  account_statement: { label: "3 - Moderate", className: "bg-yellow-50 text-yellow-700 border-yellow-200" },
};

function PriorityBadge({ queryType }: { queryType: Ticket["queryType"] }) {
  const p = PRIORITY_BY_TYPE[queryType];
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${p.className}`}>{p.label}</span>;
}

function TicketsTable({
  tickets,
  onStatusChange,
  onResolve,
  onAssign,
}: {
  tickets: Ticket[];
  onStatusChange: (id: string, s: Ticket["status"]) => void;
  onResolve: (id: string, note: string) => void;
  onAssign: (id: string, assignee: string | null) => void;
}) {
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  if (tickets.length === 0) {
    return <EmptyState text="No incidents match this filter." />;
  }

  function startResolving(id: string) {
    setResolvingId(id);
    setNoteDraft("");
  }

  function submitResolve(id: string) {
    onResolve(id, noteDraft);
    setResolvingId(null);
    setNoteDraft("");
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white">
      <table className="w-full text-left text-[13px]">
        <thead className="bg-[#f6f7f9] text-[11px] uppercase tracking-wide text-[#5b6b7c]">
          <tr>
            <th className="px-4 py-3 whitespace-nowrap">Number</th>
            <th className="px-4 py-3 whitespace-nowrap">Caller</th>
            <th className="px-4 py-3 whitespace-nowrap">Type</th>
            <th className="px-4 py-3 whitespace-nowrap">Reference</th>
            <th className="px-4 py-3">Short description</th>
            <th className="px-4 py-3 whitespace-nowrap">Priority</th>
            <th className="px-4 py-3 whitespace-nowrap">SLA due</th>
            <th className="px-4 py-3 whitespace-nowrap">State</th>
            <th className="px-4 py-3 whitespace-nowrap">Assignee</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
            <Fragment key={t.id}>
              <tr className="border-t border-black/5">
                <td className="px-4 py-3 font-mono text-[12px] whitespace-nowrap text-[#5b6b7c]">{formatTicketReference(t.id)}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <p className="font-medium text-[#0f1729]">{t.vendorName}</p>
                  <p className="text-[11px] text-[#5b6b7c]">{t.vendorCode}</p>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-[#5b6b7c]">{t.queryType.replace("_", " ")}</td>
                <td className="px-4 py-3 whitespace-nowrap text-[#5b6b7c]">{t.reference ?? "—"}</td>
                <td className="max-w-[240px] px-4 py-3 text-[#5b6b7c]">
                  <p className="truncate" title={t.reason}>
                    {t.reason}
                  </p>
                  {t.resolutionNote && (
                    <p className="mt-1 truncate text-[11px] italic text-emerald-700" title={t.resolutionNote}>
                      Reply sent: {t.resolutionNote}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <PriorityBadge queryType={t.queryType} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-[#5b6b7c]">{formatDateTime(t.slaDueAt)}</td>
                <td className="px-4 py-3 whitespace-nowrap"><StateBadge status={t.status} /></td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <select
                    value={t.assignee ?? ""}
                    onChange={(e) => onAssign(t.id, e.target.value || null)}
                    className="rounded-lg border border-black/15 bg-white px-2 py-1 text-[11px] text-[#0f1729] outline-none focus:border-[#C9A227]"
                  >
                    <option value="">Unassigned</option>
                    {AGENTS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
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
                        onClick={() => (resolvingId === t.id ? setResolvingId(null) : startResolving(t.id))}
                        className="rounded-full bg-[#C9A227] px-2.5 py-1 text-[11px] text-white hover:bg-[#A9860E]"
                      >
                        Resolve
                      </button>
                    </div>
                  )}
                </td>
              </tr>
              {resolvingId === t.id && (
                <tr className="border-t border-black/5 bg-[#f6f7f9]">
                  <td colSpan={10} className="px-4 py-3">
                    <div className="flex flex-col gap-2">
                      <label className="text-[11px] font-medium text-[#5b6b7c]">
                        Reply to {t.vendorName} — this is emailed to {t.vendorEmail} when resolved
                      </label>
                      <textarea
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        rows={2}
                        placeholder="e.g. This invoice has been released and payment is scheduled for..."
                        className="w-full rounded-lg border border-black/15 px-3 py-2 text-sm outline-none focus:border-[#C9A227]"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => submitResolve(t.id)}
                          className="rounded-full bg-[#C9A227] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[#A9860E]"
                        >
                          Send &amp; resolve
                        </button>
                        <button
                          onClick={() => setResolvingId(null)}
                          className="rounded-full border border-black/10 px-3 py-1.5 text-[11px] hover:bg-black/5"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
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
    <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white">
      <table className="w-full text-left text-[13px]">
        <thead className="bg-[#f6f7f9] text-[11px] uppercase tracking-wide text-[#5b6b7c]">
          <tr>
            <th className="px-4 py-3 whitespace-nowrap">Time</th>
            <th className="px-4 py-3 whitespace-nowrap">Vendor</th>
            <th className="px-4 py-3 whitespace-nowrap">Type</th>
            <th className="px-4 py-3 whitespace-nowrap">Outcome</th>
            <th className="px-4 py-3">Summary</th>
            <th className="px-4 py-3 whitespace-nowrap">Time to resolve</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-t border-black/5">
              <td className="px-4 py-3 whitespace-nowrap text-[#5b6b7c]">{formatDateTime(e.timestamp)}</td>
              <td className="px-4 py-3 whitespace-nowrap text-[#0f1729]">{e.vendorName}</td>
              <td className="px-4 py-3 whitespace-nowrap text-[#5b6b7c]">{e.queryType.replace("_", " ")}</td>
              <td className="px-4 py-3 whitespace-nowrap">
                <OutcomeBadge outcome={e.outcome} />
              </td>
              <td className="max-w-[320px] px-4 py-3 text-[#5b6b7c]">
                <p className="truncate" title={e.responseSummary}>
                  {e.responseSummary}
                </p>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-[#5b6b7c]">{e.resolutionSeconds.toFixed(1)}s</td>
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
    <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white">
      <table className="w-full text-left text-[13px]">
        <thead className="bg-[#f6f7f9] text-[11px] uppercase tracking-wide text-[#5b6b7c]">
          <tr>
            <th className="px-4 py-3 whitespace-nowrap">Time</th>
            <th className="px-4 py-3 whitespace-nowrap">Actor</th>
            <th className="px-4 py-3 whitespace-nowrap">Action</th>
            <th className="px-4 py-3">Details</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-t border-black/5">
              <td className="px-4 py-3 whitespace-nowrap text-[#5b6b7c]">{formatDateTime(e.timestamp)}</td>
              <td className="px-4 py-3 whitespace-nowrap text-[#0f1729]">{e.actor}</td>
              <td className="px-4 py-3 whitespace-nowrap text-[#5b6b7c]">{e.action}</td>
              <td className="max-w-[420px] px-4 py-3 text-[#5b6b7c]">
                <p className="truncate" title={e.details}>
                  {e.details}
                </p>
              </td>
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
