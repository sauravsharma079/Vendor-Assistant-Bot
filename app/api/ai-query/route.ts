import { NextRequest, NextResponse } from "next/server";
import { resolveQuery } from "@/lib/resolver";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { parseVendorIntent, phraseResponse } from "@/lib/llm/vendor-assistant";
import { LlmNotConfiguredError } from "@/lib/llm/groq";

// Free-text alternative to /api/query. Session-gated exactly the same way
// (vendor identity comes only from the signed cookie), and every answer
// still comes from resolveQuery() — the same function the menu-driven flow
// uses. The LLM only classifies intent and rewords the result; see
// lib/llm/vendor-assistant.ts for why that split matters here.
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
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  try {
    const intent = await parseVendorIntent(message);

    if (!intent.queryType) {
      return NextResponse.json({
        kind: "clarify",
        message:
          intent.clarification ?? "Could you tell me if this is about an invoice, a payment, or your Form 16A / Form 26AS / TDS certificate?",
      });
    }

    // general_inquiry has no invoice/PO/FY/date-range to extract — the
    // vendor's own message *is* the request, so it goes to the ticket
    // verbatim rather than through the LLM's (here, irrelevant) reference
    // extraction.
    const reference = intent.queryType === "general_inquiry" ? message : intent.reference;

    const result = await resolveQuery({
      vendor: { vendorCode: session.vendorCode, vendorName: session.vendorName, email: session.email },
      queryType: intent.queryType,
      reference,
    });

    // queryType/reference are echoed back so the client can offer a
    // "still need help?" follow-up ticket against the same resolved query.
    if (result.kind === "resolved" || result.kind === "escalated") {
      const phrased = await phraseResponse(message, result.summary);
      return NextResponse.json({ ...result, summary: phrased, queryType: intent.queryType, reference });
    }

    return NextResponse.json({ ...result, queryType: intent.queryType, reference });
  } catch (err) {
    if (err instanceof LlmNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    // A Groq outage/bad model name/etc. shouldn't surface as an opaque
    // 500 the client can't parse — report it the same way a SAP failure
    // is reported, so the vendor gets an intelligible message either way.
    console.error("[ai-query] LLM request failed:", err);
    return NextResponse.json(
      { error: "The AI assistant couldn't process that right now. Please try again or use the buttons below." },
      { status: 502 }
    );
  }
}
