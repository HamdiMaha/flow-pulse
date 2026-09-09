/* ------------------------------------------------------------------ *
 * Front-end helper for the AI summary / Ask box.
 *
 * Calls the dev-server endpoint at /api/ai (see vite.config.ts), which
 * holds the Gemini key and talks to Google. If the key isn't set, the
 * network fails, or anything else goes wrong, this returns null and the
 * caller falls back to the built-in rule-based text.
 * ------------------------------------------------------------------ */

export interface AiContext {
  flow: string;
  range: string;
  passRate: number;
  passed: number;
  failed: number;
  ignored: number;
  prevPassRate: number | null;
  failuresByCategory: Record<string, number>;
  failuresBySeverity: Record<string, number>;
  failuresWithJira: number;
  sampleFailures: { id: string; date: string; category: string; severity: string; note: string }[];
}

export interface AiRequest {
  mode: "summary" | "ask";
  question?: string;
  context: AiContext;
}

/** POST to /api/ai. Resolves to the model's text, or null on any failure. */
export async function askAI(
  body: AiRequest,
  signal?: AbortSignal
): Promise<string | null> {
  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { text?: string };
    const text = data.text?.trim();
    return text ? text : null;
  } catch {
    return null;
  }
}
