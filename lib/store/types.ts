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
  queryType: QueryType;
  reference: string | null;
  reason: string;
  status: "open" | "in_progress" | "resolved";
  slaDueAt: string; // ISO
  queryLogId: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string; // ISO
  actor: string; // "vendor:<code>" or "system"
  action: string;
  details: string;
}
