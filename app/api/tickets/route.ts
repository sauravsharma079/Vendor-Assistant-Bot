import { NextRequest, NextResponse } from "next/server";
import { getTickets, updateTicketStatus, updateTicketAssignee, addAuditEntry } from "@/lib/store";
import { getEmailSender } from "@/lib/email";
import { formatTicketReference } from "@/lib/ticket-ref";

export async function GET() {
  return NextResponse.json({ tickets: getTickets() });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  if (body.status === undefined && "assignee" in body) {
    const assignee = typeof body.assignee === "string" && body.assignee.trim() ? body.assignee.trim() : null;
    const updated = updateTicketAssignee(body.id, assignee);
    if (!updated) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }
    return NextResponse.json({ ticket: updated });
  }

  if (!body.status) {
    return NextResponse.json({ error: "status is required" }, { status: 400 });
  }

  const note = typeof body.note === "string" ? body.note.trim() : undefined;
  const updated = updateTicketStatus(body.id, body.status, note);
  if (!updated) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  if (body.status === "resolved") {
    const ticketRef = formatTicketReference(updated.id);
    const message = updated.resolutionNote || "Your ticket has been resolved. Please reach out if you have further questions.";
    if (!updated.vendorEmail) {
      addAuditEntry({
        actor: "business_support",
        action: "ticket_resolution_email_skipped",
        details: `No email on file for ${updated.vendorName} (${updated.vendorCode}) — resolution email not sent for ticket ${ticketRef}`,
      });
    } else {
      try {
        await getEmailSender().sendTicketResolved(updated.vendorEmail, updated.vendorName, ticketRef, message);
        addAuditEntry({
          actor: "business_support",
          action: "ticket_resolution_emailed",
          details: `Resolution email sent to ${updated.vendorEmail} for ticket ${ticketRef}`,
        });
      } catch (err) {
        addAuditEntry({
          actor: "business_support",
          action: "ticket_resolution_email_failed",
          details: `Could not email ${updated.vendorEmail} for ticket ${ticketRef}: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  return NextResponse.json({ ticket: updated });
}
