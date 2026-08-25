"use client";

import { useEffect, useState, useCallback, useMemo, Fragment } from "react";
import { useRouter } from "next/navigation";
import type { Ticket, QueryLogEntry, AuditLogEntry } from "@/lib/store/types";
import { formatTicketReference } from "@/lib/ticket-ref";
import { exportAnalyticsPdf, exportAnalyticsPpt, type AnalyticsExportData } from "@/lib/analytics-export";
import { AGENTS } from "@/lib/agents";

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

// Auto-resolution against the mock SAP server is genuinely sub-second —
// often just a handful of milliseconds — so rounding to whole seconds
// erases it entirely (shows "0s", which reads as broken, not fast).
// Milliseconds below 1s, one decimal place at or above.
function formatDuration(secs: number): string {
  if (secs < 1) return `${Math.round(secs * 1000)}ms`;
  return `${secs.toFixed(1)}s`;
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

const STATE_LABEL: Record<Ticket["status"], string> = {
  open: "New",
  in_progress: "In Progress",
  waiting_for_info: "Waiting for Info",
  resolved: "Resolved",
};
const ALL_STATES = Object.keys(STATE_LABEL) as Ticket["status"][];
const TYPE_LABEL: Record<Ticket["queryType"], string> = {
  invoice_status: "Invoice status",
  payment_status: "Payment status",
  form16: "Form 16A / Form 26AS / TDS",
  account_statement: "Account statement",
  general_inquiry: "General inquiry",
};
const ALL_QUERY_TYPES = Object.keys(TYPE_LABEL) as Ticket["queryType"][];

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

// Incident table columns — which ones show, and in what order. Same
// per-browser localStorage pattern as saved views above.
type ColumnKey = "number" | "caller" | "type" | "reference" | "description" | "priority" | "slaDue" | "state" | "assignee";

const COLUMN_LABELS: Record<ColumnKey, string> = {
  number: "Number",
  caller: "Caller",
  type: "Type",
  reference: "Reference",
  description: "Short description",
  priority: "Priority",
  slaDue: "SLA due",
  state: "State",
  assignee: "Assignee",
};

const DEFAULT_COLUMNS: ColumnKey[] = ["number", "caller", "type", "reference", "description", "priority", "slaDue", "state", "assignee"];
const COLUMN_PREFS_KEY = "vqa_admin_incident_columns";

interface ColumnPrefs {
  order: ColumnKey[];
  hidden: ColumnKey[];
}

function isColumnKey(v: unknown): v is ColumnKey {
  return typeof v === "string" && (DEFAULT_COLUMNS as string[]).includes(v);
}

function loadColumnPrefs(): ColumnPrefs {
  if (typeof window === "undefined") return { order: DEFAULT_COLUMNS, hidden: [] };
  try {
    const raw = window.localStorage.getItem(COLUMN_PREFS_KEY);
    if (!raw) return { order: DEFAULT_COLUMNS, hidden: [] };
    const parsed = JSON.parse(raw) as Partial<ColumnPrefs>;
    // Guards against a stale saved layout missing a column shipped since —
    // any unknown/missing keys fall back to their default-order position.
    const savedOrder = (parsed.order ?? []).filter(isColumnKey);
    const missing = DEFAULT_COLUMNS.filter((c) => !savedOrder.includes(c));
    return { order: [...savedOrder, ...missing], hidden: (parsed.hidden ?? []).filter(isColumnKey) };
  } catch {
    return { order: DEFAULT_COLUMNS, hidden: [] };
  }
}

function persistColumnPrefs(prefs: ColumnPrefs) {
  try {
    window.localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // best-effort — private browsing / storage quota, layout just won't persist
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
  waiting_for_info: "#7c3aed",
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

  const [columnPrefs, setColumnPrefs] = useState<ColumnPrefs>({ order: DEFAULT_COLUMNS, hidden: [] });
  const [customizingColumns, setCustomizingColumns] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  useEffect(() => {
    setSavedViews(loadSavedViews());
    setColumnPrefs(loadColumnPrefs());
  }, []);

  function moveColumn(key: ColumnKey, dir: -1 | 1) {
    setColumnPrefs((prev) => {
      const idx = prev.order.indexOf(key);
      const swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= prev.order.length) return prev;
      const nextOrder = [...prev.order];
      [nextOrder[idx], nextOrder[swapIdx]] = [nextOrder[swapIdx], nextOrder[idx]];
      const next = { ...prev, order: nextOrder };
      persistColumnPrefs(next);
      return next;
    });
  }

  function toggleColumn(key: ColumnKey) {
    setColumnPrefs((prev) => {
      const hidden = prev.hidden.includes(key) ? prev.hidden.filter((c) => c !== key) : [...prev.hidden, key];
      const next = { ...prev, hidden };
      persistColumnPrefs(next);
      return next;
    });
  }

  function resetColumns() {
    const next: ColumnPrefs = { order: DEFAULT_COLUMNS, hidden: [] };
    setColumnPrefs(next);
    persistColumnPrefs(next);
  }

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
  const avgResolutionSecs = total > 0 ? queryLog.reduce((s, q) => s + q.resolutionSeconds, 0) / total : 0;

  const stateChartData: BarDatum[] = ALL_STATES.map((s) => ({
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

  const typeChartData: BarDatum[] = ALL_QUERY_TYPES.map((qt) => ({
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

  const avgResolutionByType: BarDatum[] = ALL_QUERY_TYPES.map((qt) => {
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

  const selectedTicket = tickets.find((t) => t.id === selectedTicketId) ?? null;

  async function setStatus(id: string, status: Ticket["status"], note?: string) {
    await fetch("/api/tickets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, note }),
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

  // Sends a message to the vendor without changing the ticket's status —
  // for a plain reply/update that doesn't fit "waiting for info" or "resolved".
  async function replyTicket(id: string, reply: string) {
    await fetch("/api/tickets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, reply }),
    });
    refresh();
  }

  // Assigning a ticket notifies the agent by email — see app/api/tickets/route.ts.
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
        { label: "Avg. resolution", value: total > 0 ? formatDuration(avgResolutionSecs) : "—", sub: "vs. hours/days by email" },
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
            <StatCard label="Avg. resolution" value={total > 0 ? formatDuration(avgResolutionSecs) : "—"} sub="vs. hours/days by email" />
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

            <BarChart title="Avg. response time by type" data={avgResolutionByType} valueFormatter={formatDuration} />
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
                <option value="waiting_for_info">Waiting for Info</option>
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
                <option value="general_inquiry">General inquiry</option>
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
              <button
                onClick={() => setCustomizingColumns((v) => !v)}
                className="ml-auto text-[11px] text-[#5b6b7c] hover:text-[#0f1729] hover:underline"
              >
                {customizingColumns ? "Close column settings" : "Customize columns"}
              </button>
            </div>

            {customizingColumns && (
              <div className="rounded-xl border border-black/10 bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-medium text-[#5b6b7c]">
                    Show, hide, and reorder incident columns — saved to this browser.
                  </p>
                  <button onClick={resetColumns} className="text-[11px] text-[#5b6b7c] hover:text-[#0f1729] hover:underline">
                    Reset to default
                  </button>
                </div>
                <div className="flex flex-col gap-1">
                  {columnPrefs.order.map((key, i) => (
                    <div key={key} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-black/[0.03]">
                      <input
                        type="checkbox"
                        checked={!columnPrefs.hidden.includes(key)}
                        onChange={() => toggleColumn(key)}
                        className="h-3.5 w-3.5 accent-[#C9A227]"
                      />
                      <span className="flex-1 text-[12px] text-[#0f1729]">{COLUMN_LABELS[key]}</span>
                      <button
                        onClick={() => moveColumn(key, -1)}
                        disabled={i === 0}
                        aria-label={`Move ${COLUMN_LABELS[key]} up`}
                        className="rounded px-1.5 py-0.5 text-[11px] text-[#5b6b7c] hover:bg-black/5 disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveColumn(key, 1)}
                        disabled={i === columnPrefs.order.length - 1}
                        aria-label={`Move ${COLUMN_LABELS[key]} down`}
                        className="rounded px-1.5 py-0.5 text-[11px] text-[#5b6b7c] hover:bg-black/5 disabled:opacity-30"
                      >
                        ↓
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-[#5b6b7c]">Loading&hellip;</p>
        ) : tab === "tickets" ? (
          <TicketsTable
            tickets={filteredTickets}
            columns={columnPrefs.order.filter((c) => !columnPrefs.hidden.includes(c))}
            onStatusChange={setStatus}
            onResolve={resolveTicket}
            onReply={replyTicket}
            onAssign={assignTicket}
            onOpenDetail={setSelectedTicketId}
          />
        ) : tab === "log" ? (
          <QueryLogTable entries={queryLog} />
        ) : tab === "audit" ? (
          <AuditTable entries={auditLog} />
        ) : null}
      </div>

      {selectedTicket && (
        <TicketDetailPanel
          ticket={selectedTicket}
          auditLog={auditLog}
          onStatusChange={setStatus}
          onResolve={resolveTicket}
          onReply={replyTicket}
          onAssign={assignTicket}
          onClose={() => setSelectedTicketId(null)}
        />
      )}
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
  const map: Record<Ticket["status"], string> = {
    open: "bg-blue-50 text-blue-700 border-blue-200",
    in_progress: "bg-amber-50 text-amber-700 border-amber-200",
    waiting_for_info: "bg-violet-50 text-violet-700 border-violet-200",
    resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${map[status]}`}>{STATE_LABEL[status]}</span>;
}

const PRIORITY_BY_TYPE: Record<Ticket["queryType"], { label: string; className: string }> = {
  invoice_status: { label: "2 - High", className: "bg-orange-50 text-orange-700 border-orange-200" },
  payment_status: { label: "2 - High", className: "bg-orange-50 text-orange-700 border-orange-200" },
  form16: { label: "3 - Moderate", className: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  account_statement: { label: "3 - Moderate", className: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  general_inquiry: { label: "3 - Moderate", className: "bg-yellow-50 text-yellow-700 border-yellow-200" },
};

function PriorityBadge({ queryType }: { queryType: Ticket["queryType"] }) {
  const p = PRIORITY_BY_TYPE[queryType];
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${p.className}`}>{p.label}</span>;
}

type NoteMode = "resolve" | "waiting" | "reply";

const NOTE_COPY: Record<NoteMode, { label: string; placeholder: string; hint: string }> = {
  resolve: {
    label: "Send & resolve",
    placeholder: "e.g. This invoice has been released and payment is scheduled for...",
    hint: "when resolved",
  },
  waiting: {
    label: "Send & mark waiting",
    placeholder: "e.g. Could you confirm the GRN number for this invoice?",
    hint: "to ask for more information",
  },
  reply: {
    label: "Send reply",
    placeholder: "e.g. We're still checking with the plant team, will update you shortly.",
    hint: "as an update — status stays the same",
  },
};

const COLUMN_HEADER_CLASS: Record<ColumnKey, string> = {
  number: "px-4 py-3 whitespace-nowrap",
  caller: "px-4 py-3 whitespace-nowrap",
  type: "px-4 py-3 whitespace-nowrap",
  reference: "px-4 py-3 whitespace-nowrap",
  description: "px-4 py-3",
  priority: "px-4 py-3 whitespace-nowrap",
  slaDue: "px-4 py-3 whitespace-nowrap",
  state: "px-4 py-3 whitespace-nowrap",
  assignee: "px-4 py-3 whitespace-nowrap",
};

const COLUMN_CELL_CLASS: Record<ColumnKey, string> = {
  number: "px-4 py-3 whitespace-nowrap",
  caller: "px-4 py-3 whitespace-nowrap",
  type: "px-4 py-3 whitespace-nowrap text-[#5b6b7c]",
  reference: "px-4 py-3 whitespace-nowrap text-[#5b6b7c]",
  description: "max-w-[240px] px-4 py-3 text-[#5b6b7c]",
  priority: "px-4 py-3 whitespace-nowrap",
  slaDue: "px-4 py-3 whitespace-nowrap text-[#5b6b7c]",
  state: "px-4 py-3 whitespace-nowrap",
  assignee: "px-4 py-3 whitespace-nowrap",
};

// The 3 statuses a ticket can be moved to from the row dropdown — "open" is
// never a selectable target (nothing reopens a ticket), and once resolved
// the row hides the dropdown entirely (terminal state).
function StatusSelect({
  status,
  onPick,
}: {
  status: Ticket["status"];
  onPick: (next: Ticket["status"]) => void;
}) {
  if (status === "resolved") {
    return <StateBadge status={status} />;
  }
  return (
    <select
      value={status}
      onChange={(e) => onPick(e.target.value as Ticket["status"])}
      className="rounded-lg border border-black/15 bg-white px-2 py-1 text-[11px] text-[#0f1729] outline-none focus:border-[#C9A227]"
    >
      <option value="open" disabled>
        New
      </option>
      <option value="in_progress">In Progress</option>
      <option value="waiting_for_info">Waiting for Info</option>
      <option value="resolved">Resolved</option>
    </select>
  );
}

function TicketsTable({
  tickets,
  columns,
  onStatusChange,
  onResolve,
  onReply,
  onAssign,
  onOpenDetail,
}: {
  tickets: Ticket[];
  columns: ColumnKey[];
  onStatusChange: (id: string, s: Ticket["status"], note?: string) => void;
  onResolve: (id: string, note: string) => void;
  onReply: (id: string, reply: string) => void;
  onAssign: (id: string, assignee: string | null) => void;
  onOpenDetail: (id: string) => void;
}) {
  const [noteAction, setNoteAction] = useState<{ id: string; mode: NoteMode } | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  if (tickets.length === 0) {
    return <EmptyState text="No incidents match this filter." />;
  }

  function startNote(id: string, mode: NoteMode) {
    setNoteAction({ id, mode });
    setNoteDraft("");
  }

  function cancelNote() {
    setNoteAction(null);
    setNoteDraft("");
  }

  function submitNote() {
    if (!noteAction || !noteDraft.trim()) return;
    const { id, mode } = noteAction;
    if (mode === "resolve") onResolve(id, noteDraft);
    else if (mode === "waiting") onStatusChange(id, "waiting_for_info", noteDraft);
    else onReply(id, noteDraft);
    cancelNote();
  }

  function pickStatus(id: string, current: Ticket["status"], next: Ticket["status"]) {
    if (next === current) return;
    if (next === "in_progress") onStatusChange(id, "in_progress");
    else if (next === "waiting_for_info") startNote(id, "waiting");
    else if (next === "resolved") startNote(id, "resolve");
  }

  function renderCell(key: ColumnKey, t: Ticket): React.ReactNode {
    switch (key) {
      case "number":
        return (
          <button onClick={() => onOpenDetail(t.id)} className="font-mono text-[12px] text-[#A9860E] hover:underline">
            {formatTicketReference(t.id)}
          </button>
        );
      case "caller":
        return (
          <>
            <p className="font-medium text-[#0f1729]">{t.vendorName}</p>
            <p className="text-[11px] text-[#5b6b7c]">{t.vendorCode}</p>
          </>
        );
      case "type":
        return t.queryType.replace("_", " ");
      case "reference":
        return t.reference ?? "—";
      case "description":
        return (
          <>
            <p className="truncate" title={t.reason}>
              {t.reason}
            </p>
            {t.resolutionNote && (
              <p className="mt-1 truncate text-[11px] italic text-emerald-700" title={t.resolutionNote}>
                Last message: {t.resolutionNote}
              </p>
            )}
          </>
        );
      case "priority":
        return <PriorityBadge queryType={t.queryType} />;
      case "slaDue":
        return formatDateTime(t.slaDueAt);
      case "state":
        return <StateBadge status={t.status} />;
      case "assignee":
        return (
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
        );
    }
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white">
      <table className="w-full text-left text-[13px]">
        <thead className="bg-[#f6f7f9] text-[11px] uppercase tracking-wide text-[#5b6b7c]">
          <tr>
            {columns.map((key) => (
              <th key={key} className={COLUMN_HEADER_CLASS[key]}>
                {COLUMN_LABELS[key]}
              </th>
            ))}
            <th className="px-4 py-3 whitespace-nowrap">Status</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
            <Fragment key={t.id}>
              <tr className="border-t border-black/5">
                {columns.map((key) => (
                  <td key={key} className={COLUMN_CELL_CLASS[key]}>
                    {renderCell(key, t)}
                  </td>
                ))}
                <td className="px-4 py-3 whitespace-nowrap">
                  <StatusSelect status={t.status} onPick={(next) => pickStatus(t.id, t.status, next)} />
                </td>
              </tr>
              {noteAction?.id === t.id && (
                <tr className="border-t border-black/5 bg-[#f6f7f9]">
                  <td colSpan={columns.length + 1} className="px-4 py-3">
                    <div className="flex flex-col gap-2">
                      <label className="text-[11px] font-medium text-[#5b6b7c]">
                        Message to {t.vendorName} — emailed to {t.vendorEmail} {NOTE_COPY[noteAction.mode].hint}
                      </label>
                      <textarea
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        rows={2}
                        placeholder={NOTE_COPY[noteAction.mode].placeholder}
                        className="w-full rounded-lg border border-black/15 px-3 py-2 text-sm outline-none focus:border-[#C9A227]"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={submitNote}
                          disabled={!noteDraft.trim()}
                          className="rounded-full bg-[#C9A227] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[#A9860E] disabled:opacity-50"
                        >
                          {NOTE_COPY[noteAction.mode].label}
                        </button>
                        <button
                          onClick={cancelNote}
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

// Slide-over "incident record" — opened by clicking a ticket number.
// Combines full detail, a status dropdown, a standalone reply, and a
// History timeline (every audit log entry that mentions this ticket).
function TicketDetailPanel({
  ticket,
  auditLog,
  onStatusChange,
  onResolve,
  onReply,
  onAssign,
  onClose,
}: {
  ticket: Ticket;
  auditLog: AuditLogEntry[];
  onStatusChange: (id: string, s: Ticket["status"], note?: string) => void;
  onResolve: (id: string, note: string) => void;
  onReply: (id: string, reply: string) => void;
  onAssign: (id: string, assignee: string | null) => void;
  onClose: () => void;
}) {
  const [replyDraft, setReplyDraft] = useState("");
  const [pendingStatus, setPendingStatus] = useState<"waiting_for_info" | "resolved" | null>(null);
  const [statusNote, setStatusNote] = useState("");

  const ticketRef = formatTicketReference(ticket.id);
  // The store writes some audit entries with the raw ticket id ("Ticket
  // <id> -> ...") and email-related ones with the formatted ref ("...for
  // ticket INC..."); matching either catches every entry for this ticket.
  const history = auditLog.filter((e) => e.details.includes(ticket.id) || e.details.includes(ticketRef));

  function submitReply() {
    if (!replyDraft.trim()) return;
    onReply(ticket.id, replyDraft.trim());
    setReplyDraft("");
  }

  function selectStatus(next: Ticket["status"]) {
    if (next === ticket.status) return;
    if (next === "in_progress") {
      onStatusChange(ticket.id, "in_progress");
    } else if (next === "waiting_for_info" || next === "resolved") {
      setPendingStatus(next);
      setStatusNote("");
    }
  }

  function submitStatusNote() {
    if (!pendingStatus || !statusNote.trim()) return;
    if (pendingStatus === "resolved") onResolve(ticket.id, statusNote.trim());
    else onStatusChange(ticket.id, "waiting_for_info", statusNote.trim());
    setPendingStatus(null);
    setStatusNote("");
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
          <div>
            <p className="font-mono text-xs text-[#5b6b7c]">{ticketRef}</p>
            <p className="font-display text-lg font-semibold text-[#0f1729]">{ticket.vendorName}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-xl leading-none text-[#5b6b7c] hover:text-[#0f1729]">
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-[12px]">
            <div>
              <p className="text-[#5b6b7c]">Vendor code</p>
              <p className="font-medium text-[#0f1729]">{ticket.vendorCode}</p>
            </div>
            <div>
              <p className="text-[#5b6b7c]">Type</p>
              <p className="font-medium text-[#0f1729]">{TYPE_LABEL[ticket.queryType]}</p>
            </div>
            <div>
              <p className="text-[#5b6b7c]">Reference</p>
              <p className="font-medium text-[#0f1729]">{ticket.reference ?? "—"}</p>
            </div>
            <div>
              <p className="text-[#5b6b7c]">Priority</p>
              <PriorityBadge queryType={ticket.queryType} />
            </div>
            <div>
              <p className="text-[#5b6b7c]">SLA due</p>
              <p className="font-medium text-[#0f1729]">{formatDateTime(ticket.slaDueAt)}</p>
            </div>
            <div>
              <p className="text-[#5b6b7c]">Created</p>
              <p className="font-medium text-[#0f1729]">{formatDateTime(ticket.createdAt)}</p>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-[11px] font-medium text-[#5b6b7c]">Short description</p>
            <p className="mt-1 text-sm text-[#0f1729]">{ticket.reason}</p>
          </div>

          {ticket.resolutionNote && (
            <div className="mt-4">
              <p className="text-[11px] font-medium text-[#5b6b7c]">Last message sent</p>
              <p className="mt-1 text-sm italic text-emerald-700">{ticket.resolutionNote}</p>
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-[#5b6b7c]">State</label>
              <div className="mt-1">
                <StatusSelect status={ticket.status} onPick={selectStatus} />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-medium text-[#5b6b7c]">Assignee</label>
              <select
                value={ticket.assignee ?? ""}
                onChange={(e) => onAssign(ticket.id, e.target.value || null)}
                className="mt-1 w-full rounded-lg border border-black/15 bg-white px-2 py-1.5 text-[12px] text-[#0f1729] outline-none focus:border-[#C9A227]"
              >
                <option value="">Unassigned</option>
                {AGENTS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {pendingStatus && (
            <div className="mt-3 rounded-lg border border-black/10 bg-[#f6f7f9] p-3">
              <label className="text-[11px] font-medium text-[#5b6b7c]">
                Message to {ticket.vendorName} — emailed to {ticket.vendorEmail}{" "}
                {pendingStatus === "resolved" ? "when resolved" : "to ask for more information"}
              </label>
              <textarea
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                rows={2}
                autoFocus
                className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm outline-none focus:border-[#C9A227]"
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={submitStatusNote}
                  disabled={!statusNote.trim()}
                  className="rounded-full bg-[#C9A227] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[#A9860E] disabled:opacity-50"
                >
                  {pendingStatus === "resolved" ? "Send & resolve" : "Send & mark waiting"}
                </button>
                <button
                  onClick={() => setPendingStatus(null)}
                  className="rounded-full border border-black/10 px-3 py-1.5 text-[11px] hover:bg-black/5"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {ticket.status !== "resolved" && (
            <div className="mt-4">
              <label className="text-[11px] font-medium text-[#5b6b7c]">
                Send a reply — emailed to {ticket.vendorEmail}, status stays the same
              </label>
              <textarea
                value={replyDraft}
                onChange={(e) => setReplyDraft(e.target.value)}
                rows={2}
                placeholder="e.g. We're still checking with the plant team, will update you shortly."
                className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm outline-none focus:border-[#C9A227]"
              />
              <button
                onClick={submitReply}
                disabled={!replyDraft.trim()}
                className="mt-2 rounded-full border border-black/10 px-3 py-1.5 text-[11px] hover:bg-black/5 disabled:opacity-50"
              >
                Send reply
              </button>
            </div>
          )}

          <div className="mt-5 border-t border-black/10 pt-4">
            <p className="text-[11px] font-medium text-[#5b6b7c]">History</p>
            {history.length === 0 ? (
              <p className="mt-1 text-[12px] text-[#5b6b7c]">No activity recorded yet.</p>
            ) : (
              <ul className="mt-2 space-y-3 border-l border-black/10 pl-3">
                {history.map((e) => (
                  <li key={e.id} className="text-[12px]">
                    <p className="text-[#5b6b7c]">{formatDateTime(e.timestamp)}</p>
                    <p className="text-[#0f1729]">{e.details}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
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
              <td className="px-4 py-3 whitespace-nowrap text-[#5b6b7c]">{formatDuration(e.resolutionSeconds)}</td>
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
