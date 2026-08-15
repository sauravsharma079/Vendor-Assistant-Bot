import { NextRequest, NextResponse } from "next/server";
import { resolveQuery } from "@/lib/resolver";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import type { QueryType } from "@/lib/sap/types";

const VALID_TYPES: QueryType[] = ["invoice_status", "payment_status", "form16"];

export async function POST(req: NextRequest) {
  // The vendor a request is scoped to comes ONLY from the signed session
  // cookie, never from the request body. This is the enforcement point
  // for "a supplier can only get information for their own content" \u2014
  // even if a client sent a different vendorCode in the body, it would
  // be ignored.
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);
  if (!session) {
    return NextResponse.json(
      { error: "Not signed in, or your session has expired. Please verify your vendor code again." },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { queryType, reference } = body as Record<string, string>;
  if (!queryType || !VALID_TYPES.includes(queryType as QueryType)) {
    return NextResponse.json({ error: `queryType must be one of ${VALID_TYPES.join(", ")}` }, { status: 400 });
  }

  const result = await resolveQuery({
    vendor: { vendorCode: session.vendorCode, vendorName: session.vendorName, email: session.email },
    queryType: queryType as QueryType,
    reference: reference ?? "",
  });

  return NextResponse.json(result);
}
