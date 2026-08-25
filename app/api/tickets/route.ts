import { NextRequest, NextResponse } from "next/server";
import { getTickets, updateTicketStatus, updateTicketAssignee, addTicketNote, addAuditEntry } from "@/lib/store";
import { getEmailSender } from "@/lib/email";
import { formatTicketReference } from "@/lib/ticket-ref";
import { AGENT_EMAILS } from "@/lib/agents";

export async function GET() {
  return NextResponse.json({ tickets: await getTickets() });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // --- Assignment: notifies the newly assigned agent ---
  if (body.status === undefined && body.reply === undefined && "assignee" in body) {
    const assignee = typeof body.assignee === "string" && body.assignee.trim() ? body.assignee.trim() : null;
    const updated = await updateTicketAssignee(body.id, assignee);
    if (!updated) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    if (assignee) {
      const ticketRef = formatTicketReference(updated.id);
      const agentEmail = AGENT_EMAILS[assignee];
      if (!agentEmail) {
        await addAuditEntry({
          actor: "business_support",
          action: "ticket_assignment_email_skipped",
          details: `No email on file for agent ${assignee} — assignment notification not sent for ticket ${ticketRef}`,
        });
      } else {
        try {
          await getEmailSender().sendTicketAssigned(agentEmail, assignee, ticketRef, updated.vendorName, updated.reason);
          await addAuditEntry({
            actor: "business_support",
            action: "ticket_assignment_emailed",
            details: `Assignment notification sent to ${assignee} (${agentEmail}) for ticket ${ticketRef}`,
          });
        } catch (err) {
          await addAuditEntry({
            actor: "business_support",
            action: "ticket_assignment_email_failed",
            details: `Could not notify ${assignee} (${agentEmail}) for ticket ${ticketRef}: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }
    }

    return NextResponse.json({ ticket: updated });
  }

  // --- Reply: sends a message to the vendor without changing ticket status ---
  if (body.status === undefined && typeof body.reply === "string") {
    const reply = body.reply.trim();
    if (!reply) {
      return NextResponse.json({ error: "reply is required" }, { status: 400 });
    }
    const updated = await addTicketNote(body.id, reply);
    if (!updated) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const ticketRef = formatTicketReference(updated.id);
    if (!updated.vendorEmail) {
      await addAuditEntry({
        actor: "business_support",
        action: "ticket_reply_email_skipped",
        details: `No email on file for ${updated.vendorName} (${updated.vendorCode}) — reply not emailed for ticket ${ticketRef}`,
      });
    } else {
      try {
        await getEmailSender().sendTicketUpdate(updated.vendorEmail, updated.vendorName, ticketRef, reply, "reply");
        await addAuditEntry({
          actor: "business_support",
          action: "ticket_reply_emailed",
          details: `Reply emailed to ${updated.vendorEmail} for ticket ${ticketRef}`,
        });
      } catch (err) {
        await addAuditEntry({
          actor: "business_support",
          action: "ticket_reply_email_failed",
          details: `Could not email ${updated.vendorEmail} for ticket ${ticketRef}: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    return NextResponse.json({ ticket: updated });
  }

  // --- Status change: In Progress (silent), Waiting for Information / Resolved (emails the vendor) ---
  if (!body.status) {
    return NextResponse.json({ error: "status is required" }, { status: 400 });
  }

  const note = typeof body.note === "string" ? body.note.trim() : undefined;
  const updated = await updateTicketStatus(body.id, body.status, note);
  if (!updated) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  if (body.status === "resolved" || body.status === "waiting_for_info") {
    const ticketRef = formatTicketReference(updated.id);
    const message =
      updated.resolutionNote ||
      (body.status === "resolved"
        ? "Your ticket has been resolved. Please reach out if you have further questions."
        : "We need some more information from you to proceed with this ticket. Please reply with details.");

    if (!updated.vendorEmail) {
      await addAuditEntry({
        actor: "business_support",
        action: "ticket_status_email_skipped",
        details: `No email on file for ${updated.vendorName} (${updated.vendorCode}) — ${body.status} email not sent for ticket ${ticketRef}`,
      });
    } else {
      try {
        if (body.status === "resolved") {
          await getEmailSender().sendTicketResolved(updated.vendorEmail, updated.vendorName, ticketRef, message);
        } else {
          await getEmailSender().sendTicketUpdate(updated.vendorEmail, updated.vendorName, ticketRef, message, "waiting_for_info");
        }
        await addAuditEntry({
          actor: "business_support",
          action: "ticket_status_emailed",
          details: `${body.status} email sent to ${updated.vendorEmail} for ticket ${ticketRef}`,
        });
      } catch (err) {
        await addAuditEntry({
          actor: "business_support",
          action: "ticket_status_email_failed",
          details: `Could not email ${updated.vendorEmail} for ticket ${ticketRef}: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  return NextResponse.json({ ticket: updated });
}
