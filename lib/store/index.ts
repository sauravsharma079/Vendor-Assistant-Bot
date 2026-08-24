import { randomUUID } from "crypto";
import type { QueryLogEntry, Ticket, AuditLogEntry } from "./types";
import { kvLoad, kvSave } from "@/lib/kv-store";

// Persists through lib/kv-store — Redis when configured (required once
// hosted on a serverless platform), a local .data/store.json file
// otherwise. The shape of get/add functions below is the only surface
// API routes depend on.

const KEY = "vqa:store";
const FILE = "store.json";

interface StoreShape {
  queryLog: QueryLogEntry[];
  tickets: Ticket[];
  auditLog: AuditLogEntry[];
}

function emptyStore(): StoreShape {
  return { queryLog: [], tickets: [], auditLog: [] };
}

function load(): Promise<StoreShape> {
  return kvLoad(KEY, FILE, emptyStore());
}

function save(store: StoreShape): Promise<void> {
  return kvSave(KEY, FILE, store);
}

export async function addQueryLogEntry(entry: Omit<QueryLogEntry, "id" | "timestamp">): Promise<QueryLogEntry> {
  const store = await load();
  const full: QueryLogEntry = { ...entry, id: randomUUID(), timestamp: new Date().toISOString() };
  store.queryLog.unshift(full);
  await save(store);
  return full;
}

export async function addTicket(ticket: Omit<Ticket, "id" | "createdAt">): Promise<Ticket> {
  const store = await load();
  const full: Ticket = { ...ticket, id: randomUUID(), createdAt: new Date().toISOString() };
  store.tickets.unshift(full);
  await save(store);
  return full;
}

export async function addAuditEntry(entry: Omit<AuditLogEntry, "id" | "timestamp">): Promise<AuditLogEntry> {
  const store = await load();
  const full: AuditLogEntry = { ...entry, id: randomUUID(), timestamp: new Date().toISOString() };
  store.auditLog.unshift(full);
  await save(store);
  return full;
}

export async function getQueryLog(): Promise<QueryLogEntry[]> {
  return (await load()).queryLog;
}

export async function getTickets(): Promise<Ticket[]> {
  return (await load()).tickets;
}

export async function getAuditLog(): Promise<AuditLogEntry[]> {
  return (await load()).auditLog;
}

export async function updateTicketStatus(id: string, status: Ticket["status"], resolutionNote?: string): Promise<Ticket | null> {
  const store = await load();
  const ticket = store.tickets.find((t) => t.id === id);
  if (!ticket) return null;
  ticket.status = status;
  if (resolutionNote !== undefined) ticket.resolutionNote = resolutionNote || null;
  await save(store);
  await addAuditEntry({ actor: "business_support", action: "ticket_status_change", details: `Ticket ${id} -> ${status}` });
  return ticket;
}

export async function updateTicketAssignee(id: string, assignee: string | null): Promise<Ticket | null> {
  const store = await load();
  const ticket = store.tickets.find((t) => t.id === id);
  if (!ticket) return null;
  ticket.assignee = assignee;
  await save(store);
  await addAuditEntry({
    actor: "business_support",
    action: "ticket_assigned",
    details: `Ticket ${id} -> ${assignee ?? "Unassigned"}`,
  });
  return ticket;
}
