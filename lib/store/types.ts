import type { QueryType } from "@/lib/sap/types";

export interface QueryLogEntry {
  id: string;
  timestamp: string; // ISO
  vendorCode: string;
  vendorName: string;
  queryType: QueryType;
  reference: string | null; // invoice/PO/period the vendor asked about
  outcome: "auto_resolved" | "escalated" | "verification_failed";
  responseSummary: string;
  resolutionSeconds: number;
}

export interface Ticket {
  id: string;
  createdAt: string; // ISO
  vendorCode: string;
  vendorName: string;
  vendorEmail: string;
  queryType: QueryType;
  reference: string | null;
  reason: string;
  status: "open" | "in_progress" | "waiting_for_info" | "resolved";
  slaDueAt: string; // ISO
  queryLogId: string;
  resolutionNote: string | null; // business support's reply, shown to the vendor via email on resolve
  assignee: string | null; // business support agent this ticket is assigned to
}

export interface AuditLogEntry {
  id: string;
  timestamp: string; // ISO
  actor: string; // "vendor:<code>" or "system"
  action: string;
  details: string;
}
