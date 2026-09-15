import { defineConfig, loadEnv, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";

/* ------------------------------------------------------------------ *
 * Dev-only /api/ai endpoint.
 *
 * Holds the Gemini credentials server-side (never shipped to the
 * browser) and proxies the AI summary / Ask box to Google. Same idea
 * as the SiteAnalyzer backend, minus the separate Python process —
 * and the same two auth modes SiteAnalyzer supports:
 *
 *   - API key (GEMINI_API_KEY / GOOGLE_API_KEY) — the simple mode, a
 *     key from https://aistudio.google.com/apikey.
 *   - Vertex AI service account (GOOGLE_APPLICATION_CREDENTIALS
 *     pointing at a service-account JSON file) — the mode issued by
 *     managed/work Google Cloud orgs, which typically don't hand out
 *     simple API keys. Also needs GOOGLE_CLOUD_PROJECT (the JSON's
 *     project_id) and optionally GOOGLE_CLOUD_LOCATION (defaults to
 *     us-central1).
 *
 * Whichever is present wins (API key first). Neither configured ->
 * responds with empty text, and the front end quietly falls back to
 * its built-in rule-based text.
 *
 * Runs under `npm run dev` only. `vite build` / `vite preview` do not
 * include it — a real deployment needs an actual backend route.
 * ------------------------------------------------------------------ */
function geminiEndpoint(env: Record<string, string>): PluginOption {
  const apiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY || "";
  const vertexCreds = env.GOOGLE_APPLICATION_CREDENTIALS || "";
  const vertexProject = env.GOOGLE_CLOUD_PROJECT || "";
  const vertexLocation = env.GOOGLE_CLOUD_LOCATION || "us-central1";
  const useVertex = !apiKey && !!vertexCreds && !!vertexProject;
  const model = env.GEMINI_MODEL || "gemini-2.0-flash";
  const configured = !!apiKey || useVertex;

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

          if (!configured) {
            // No usable credentials: return empty so the front end uses its
            // rule-based text. Logged (not silent) so a misconfigured .env
            // is easy to spot in the terminal running `npm run dev`.
            console.warn(
              `[api/ai] not configured — apiKey=${apiKey ? "set" : "empty"} ` +
                `vertexCreds=${vertexCreds ? "set" : "empty"} ` +
                `vertexProject=${vertexProject ? "set" : "empty"}`
            );
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
            const ai = useVertex
              ? new GoogleGenAI({
                  vertexai: true,
                  project: vertexProject,
                  location: vertexLocation,
                  // Pass the key file explicitly rather than relying on the
                  // GOOGLE_APPLICATION_CREDENTIALS env var, since loadEnv()
                  // only gives us a plain object, not a real process env.
                  googleAuthOptions: { keyFile: vertexCreds },
                })
              : new GoogleGenAI({ apiKey });

            const out = await ai.models.generateContent({
              model,
              contents: prompt,
            });

            res.end(JSON.stringify({ text: out.text ?? "" }));
          } catch (err) {
            // Printed to the terminal running `npm run dev` — the browser
            // never sees this (askAI() only checks res.ok and falls back).
            console.error("[api/ai] Gemini call failed:", err);
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
