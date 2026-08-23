// Short, client-presentable ticket reference derived from a ticket's
// internal UUID (lib/store/types.ts Ticket.id). Shared between the server
// (lib/resolver.ts, shown to vendors) and the client (AdminDashboard.tsx,
// shown to business support) so both sides display the same code.
// Formatted like a ServiceNow incident number (INC0010023) to match the
// business support dashboard's ITSM-style presentation.
export function formatTicketReference(ticketId: string): string {
  const hex = ticketId.replace(/-/g, "").slice(0, 8);
  const num = parseInt(hex, 16) % 10_000_000;
  return `INC${String(num).padStart(7, "0")}`;
}
