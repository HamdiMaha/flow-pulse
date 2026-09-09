import { defineConfig, loadEnv, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";

/* ------------------------------------------------------------------ *
 * Dev-only /api/ai endpoint.
 *
 * Holds the Gemini key server-side (never shipped to the browser) and
 * proxies the AI summary / Ask box to Google. Same idea as the
 * SiteAnalyzer backend, minus the separate Python process.
 *
 * No GEMINI_API_KEY in the environment -> responds 503, and the front
 * end quietly falls back to its built-in rule-based text.
 *
 * Runs under `npm run dev` only. `vite build` / `vite preview` do not
 * include it — a real deployment needs an actual backend route.
 * ------------------------------------------------------------------ */
function geminiEndpoint(env: Record<string, string>): PluginOption {
  const apiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY || "";
  const model = env.GEMINI_MODEL || "gemini-2.0-flash";

  const SYSTEM =
    "You are a QA analyst reading automated test-run stats for a single flow. " +
    "Reply in 2-4 sentences of plain text — no markdown, no lists, no preamble. " +
    "Use ONLY the numbers in the JSON provided; never invent data. " +
    "Be concrete about the pass rate, the failure count, and where failures cluster.";

  return {
    name: "flow-pulse-gemini",
    configureServer(server) {
      server.middlewares.use("/api/ai", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          return res.end();
        }
        let raw = "";
        req.on("data", (c) => (raw += c));
        req.on("end", async () => {
          res.setHeader("content-type", "application/json");

          if (!apiKey) {
            // No key: return empty so the front end uses its rule-based text,
            // without a noisy error in the browser console.
            return res.end(JSON.stringify({ text: "", reason: "no_key" }));
          }

          try {
            const { mode, question, context } = JSON.parse(raw || "{}");
            const prompt =
              mode === "ask"
                ? `${SYSTEM}\n\nDATA:\n${JSON.stringify(context)}\n\nQUESTION: ${question}`
                : `${SYSTEM}\n\nWrite a short status summary for this flow.\n\nDATA:\n${JSON.stringify(
                    context
                  )}`;

            const { GoogleGenAI } = await import("@google/genai");
            const ai = new GoogleGenAI({ apiKey });
            const out = await ai.models.generateContent({
              model,
              contents: prompt,
            });

            res.end(JSON.stringify({ text: out.text ?? "" }));
          } catch (err) {
            res.statusCode = 502;
            res.end(
              JSON.stringify({ error: String((err as Error).message ?? err) })
            );
          }
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Loads .env / .env.local (all keys, no VITE_ prefix filter).
  const env = loadEnv(mode, process.cwd(), "");
  const port = Number(process.env.PORT || env.PORT || 5173);

  return {
    plugins: [react(), geminiEndpoint(env)],
    server: { port, strictPort: false },
  };
});
