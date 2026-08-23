import { NextRequest, NextResponse } from "next/server";
import { openFollowUpTicket } from "@/lib/resolver";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import type { QueryType } from "@/lib/sap/types";

const VALID_TYPES: QueryType[] = ["invoice_status", "payment_status", "form16", "account_statement"];

// A vendor already got an answer from /api/query or /api/ai-query but still
// needs help with it — this opens a business support ticket with their own
// description, same session-scoping as every other vendor-data endpoint.
export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);
  if (!session) {
    return NextResponse.json(
      { error: "Not signed in, or your session has expired. Please verify your vendor code again." },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => null);
  const queryType = body?.queryType;
  const reference = typeof body?.reference === "string" ? body.reference : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";

  if (!queryType || !VALID_TYPES.includes(queryType)) {
    return NextResponse.json({ error: `queryType must be one of ${VALID_TYPES.join(", ")}` }, { status: 400 });
  }
  if (!description) {
    return NextResponse.json({ error: "Please describe what you still need help with." }, { status: 400 });
  }

  const ticket = await openFollowUpTicket(
    { vendorCode: session.vendorCode, vendorName: session.vendorName, email: session.email },
    queryType as QueryType,
    reference,
    description
  );

  return NextResponse.json(ticket);
}
