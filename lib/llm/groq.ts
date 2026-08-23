// Thin client for Groq's OpenAI-compatible chat completions API — free
// tier, no SDK needed. Used only for (1) classifying a vendor's free-text
// question into one of the existing query types, and (2) rephrasing an
// already-fetched, already-verified SAP summary in a warmer tone. It never
// generates facts itself — see lib/llm/vendor-assistant.ts.

export class LlmNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmNotConfiguredError";
  }
}

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export async function groqChat(messages: ChatMessage[], opts: { json?: boolean; temperature?: number } = {}): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new LlmNotConfiguredError(
      "GROQ_API_KEY is not set. Get a free key at console.groq.com and add it to .env.local before AI chat can answer."
    );
  }

  const model = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.3,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Groq request failed: ${res.status} ${res.statusText} — ${body}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}
