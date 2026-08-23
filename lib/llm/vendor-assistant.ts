// AI layer for the vendor chat — grounded by design. The LLM is used for
// exactly two things:
//   1. parseVendorIntent — read a free-text question, decide which of the
//      four existing query types it is and what reference (invoice/PO/FY/
//      date range) was mentioned. It never answers the question itself.
//   2. phraseResponse — take a factual summary that lib/resolver.ts already
//      built from a live SAP lookup, and reword it more conversationally.
//      It is explicitly instructed not to change any fact, and if the LLM
//      call fails for any reason, the original factual summary is returned
//      unchanged — the AI layer can only add polish, never block or alter
//      an answer.
import type { QueryType } from "@/lib/sap/types";
import { groqChat } from "./groq";

export interface ParsedIntent {
  queryType: QueryType | null;
  reference: string;
  clarification: string | null;
}

const VALID_TYPES: QueryType[] = ["invoice_status", "payment_status", "form16", "account_statement"];

const INTENT_SYSTEM_PROMPT = `You are an intent classifier for a manufacturing vendor query bot. Vendors ask about one of exactly four things:
- "invoice_status" — status of a specific invoice or purchase order (needs an invoice number or PO number)
- "payment_status" — whether a payment has cleared (an invoice number is optional; if none given, they mean "all recent payments")
- "form16" — their Form 16A / Form 26AS / TDS withholding certificate (needs a financial year like "2025-26"; if none given, assume the current year)
- "account_statement" — reconciliation-style questions covering their invoices and payments for a period: a full statement of account, an aging summary of outstanding invoices, total payable this month/quarter, which invoices were submitted/paid/are pending approval in a period, or "what do I owe". Examples: "statement of account", "aging summary", "how much do I owe this quarter", "which invoices are still pending approval this month", "invoices paid last month". Today's date is ${new Date().toISOString().slice(0, 10)}. If a date range is mentioned, convert it to "YYYY-MM-DD:YYYY-MM-DD" (start:end). If no range is given (e.g. "this year", "recently", or nothing at all), use an empty string — the system defaults to the current financial year (April-March in India).

Read the vendor's message and respond with ONLY a JSON object, no other text:
{"queryType": "invoice_status" | "payment_status" | "form16" | "account_statement" | null, "reference": "<the invoice/PO number, financial year, or date range mentioned, or empty string>", "clarification": "<if queryType is null, one short friendly sentence asking what they need, mentioning the options; otherwise null>"}`;

export async function parseVendorIntent(message: string): Promise<ParsedIntent> {
  const raw = await groqChat(
    [
      { role: "system", content: INTENT_SYSTEM_PROMPT },
      { role: "user", content: message },
    ],
    { json: true, temperature: 0.1 }
  );

  try {
    const parsed = JSON.parse(raw) as { queryType?: string; reference?: string; clarification?: string };
    const queryType = VALID_TYPES.includes(parsed.queryType as QueryType) ? (parsed.queryType as QueryType) : null;
    return {
      queryType,
      reference: typeof parsed.reference === "string" ? parsed.reference.trim() : "",
      clarification: typeof parsed.clarification === "string" ? parsed.clarification : null,
    };
  } catch {
    return {
      queryType: null,
      reference: "",
      clarification:
        "I couldn't quite tell what you need — could you let me know if this is about an invoice, a payment, your Form 16A / Form 26AS / TDS certificate, or a full account statement?",
    };
  }
}

const PHRASE_SYSTEM_PROMPT = `You rewrite factual summaries from a vendor query bot in a warmer, more conversational tone. The summary was already generated from a live SAP lookup — every fact in it is correct and final.

Rules:
- Do not add, remove, invent, or change any number, date, status word, ticket reference, or amount.
- Do not speculate about anything not stated in the summary.
- Keep it to 2-4 sentences.
- If the summary mentions a support ticket was raised, keep the ticket reference and timeframe clearly stated.
- Reply with only the rewritten text, no preamble.`;

export async function phraseResponse(question: string, factualSummary: string): Promise<string> {
  try {
    const raw = await groqChat(
      [
        { role: "system", content: PHRASE_SYSTEM_PROMPT },
        { role: "user", content: `Vendor's question: "${question}"\n\nFactual summary from SAP: "${factualSummary}"\n\nRewrite it naturally.` },
      ],
      { temperature: 0.4 }
    );
    return raw.trim() || factualSummary;
  } catch {
    // The AI layer is purely additive — a phrasing failure must never cost
    // the vendor their (already-fetched, already-correct) answer.
    return factualSummary;
  }
}
