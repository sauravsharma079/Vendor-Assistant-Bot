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
      // parseVendorIntent() always fills in a clarification whenever
      // queryType is null — this text is an unreachable-in-practice
      // safety net for that contract, kept only in case it's ever violated.
      return NextResponse.json({
        kind: "clarify",
        message:
          intent.clarification ||
          "Could you tell me a bit more about what you need — an invoice, a payment, your Form 16A / Form 26AS / TDS certificate, an account statement, or something else our Business Support team can help with?",
      });
    }

    // general_inquiry is never auto-submitted as a ticket — the vendor
    // confirms (and can add to) their own message first. The client shows
    // an editable box pre-filled with `reference` and only actually opens
    // the ticket via a separate POST to /api/follow-up once they submit.
    if (intent.queryType === "general_inquiry") {
      return NextResponse.json({
        kind: "confirm_ticket",
        queryType: "general_inquiry",
        reference: message,
        message:
          "I don't have a self-service answer for that, but I can pass it to our Business Support team. Add any more details below, then send it — or send as-is.",
      });
    }

    const reference = intent.reference;

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
