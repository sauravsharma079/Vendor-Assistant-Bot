import { NextRequest, NextResponse } from "next/server";
import { getTickets, updateTicketStatus } from "@/lib/store";

export async function GET() {
  return NextResponse.json({ tickets: getTickets() });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.id || !body?.status) {
    return NextResponse.json({ error: "id and status are required" }, { status: 400 });
  }
  const updated = updateTicketStatus(body.id, body.status);
  if (!updated) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }
  return NextResponse.json({ ticket: updated });
}
