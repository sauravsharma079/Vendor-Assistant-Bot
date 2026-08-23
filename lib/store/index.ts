import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { QueryLogEntry, Ticket, AuditLogEntry } from "./types";

// A tiny file-backed store, good enough for a standalone demo/prototype.
// Swap for a real database (Postgres, etc.) once this graduates beyond
// the demo stage \u2014 the shape of get/add functions below is the only
// surface API routes depend on.

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "store.json");

interface StoreShape {
  queryLog: QueryLogEntry[];
  tickets: Ticket[];
  auditLog: AuditLogEntry[];
}

function emptyStore(): StoreShape {
  return { queryLog: [], tickets: [], auditLog: [] };
}

function load(): StoreShape {
  try {
    if (!fs.existsSync(FILE)) return emptyStore();
    const raw = fs.readFileSync(FILE, "utf-8");
    return JSON.parse(raw) as StoreShape;
  } catch {
    return emptyStore();
  }
}

function save(store: StoreShape) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch {
    // Best-effort persistence; fall through silently if the filesystem
    // is read-only (e.g. some serverless hosts) \u2014 data still works
    // in-memory for the life of the process.
  }
}

export function addQueryLogEntry(entry: Omit<QueryLogEntry, "id" | "timestamp">): QueryLogEntry {
  const store = load();
  const full: QueryLogEntry = { ...entry, id: randomUUID(), timestamp: new Date().toISOString() };
  store.queryLog.unshift(full);
  save(store);
  return full;
}

export function addTicket(ticket: Omit<Ticket, "id" | "createdAt">): Ticket {
  const store = load();
  const full: Ticket = { ...ticket, id: randomUUID(), createdAt: new Date().toISOString() };
  store.tickets.unshift(full);
  save(store);
  return full;
}

export function addAuditEntry(entry: Omit<AuditLogEntry, "id" | "timestamp">): AuditLogEntry {
  const store = load();
  const full: AuditLogEntry = { ...entry, id: randomUUID(), timestamp: new Date().toISOString() };
  store.auditLog.unshift(full);
  save(store);
  return full;
}

export function getQueryLog(): QueryLogEntry[] {
  return load().queryLog;
}

export function getTickets(): Ticket[] {
  return load().tickets;
}

export function getAuditLog(): AuditLogEntry[] {
  return load().auditLog;
}

export function updateTicketStatus(id: string, status: Ticket["status"], resolutionNote?: string): Ticket | null {
  const store = load();
  const ticket = store.tickets.find((t) => t.id === id);
  if (!ticket) return null;
  ticket.status = status;
  if (resolutionNote !== undefined) ticket.resolutionNote = resolutionNote || null;
  save(store);
  addAuditEntry({ actor: "business_support", action: "ticket_status_change", details: `Ticket ${id} -> ${status}` });
  return ticket;
}

export function updateTicketAssignee(id: string, assignee: string | null): Ticket | null {
  const store = load();
  const ticket = store.tickets.find((t) => t.id === id);
  if (!ticket) return null;
  ticket.assignee = assignee;
  save(store);
  addAuditEntry({
    actor: "business_support",
    action: "ticket_assigned",
    details: `Ticket ${id} -> ${assignee ?? "Unassigned"}`,
  });
  return ticket;
}
