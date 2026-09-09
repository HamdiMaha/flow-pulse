import { useEffect, useState } from "react";
import type { DateRange, Flow, FlowStats } from "../types";
import { buildAiContext, fmtRange, resultsInRange } from "../lib";
import { askAI } from "../ai";

interface QA {
  q: string;
  a: string;
  source: "gemini" | "local";
}

/** Rule-based fallback — used when Gemini is unavailable or has no key. */
function answer(
  question: string,
  flow: Flow,
  range: DateRange,
  stats: FlowStats,
  prevStats: FlowStats
): string {
  const q = question.toLowerCase();
  const rows = resultsInRange(flow, range);
  const label = fmtRange(range);

  const bump = (label: string, map: Map<string, number>, n = 3) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k, v]) => `${k} (${v})`)
      .join(", ") || `no ${label}`;

  if (/why|went up|increase|worse|drop|down/.test(q)) {
    const delta = stats.passRate - prevStats.passRate;
    const byCat = new Map<string, number>();
    for (const r of rows)
      if (r.status === "failed")
        byCat.set(r.category, (byCat.get(r.category) ?? 0) + 1);
    return `Pass rate moved ${delta >= 0 ? "+" : ""}${delta.toFixed(
      1
    )} pts vs the prior window. Failures concentrate in: ${bump(
      "failures",
      byCat
    )}. Start with the top category — it accounts for the largest share of the ${stats.failed} failures in ${label}.`;
  }

  if (/severity|critical|high/.test(q)) {
    const bySev = new Map<string, number>();
    for (const r of rows)
      if (r.status === "failed")
        bySev.set(r.severity, (bySev.get(r.severity) ?? 0) + 1);
    return `Failures by severity in ${label}: ${bump("failures", bySev, 4)}.`;
  }

  if (/jira|ticket|linked/.test(q)) {
    const linked = rows.filter((r) => r.status === "failed" && r.jira).length;
    return `${linked} of ${stats.failed} failures in ${label} have a linked JIRA ticket. The remaining ${
      stats.failed - linked
    } are untracked.`;
  }

  if (/ignored|muted|skipped/.test(q)) {
    return `${stats.ignored} results are ignored in ${label} — excluded from the ${stats.passRate.toFixed(
      1
    )}% pass rate. Review them periodically so muted checks don't hide regressions.`;
  }

  if (/category|breakdown|which/.test(q)) {
    const byCat = new Map<string, number>();
    for (const r of rows) byCat.set(r.category, (byCat.get(r.category) ?? 0) + 1);
    return `Volume by category in ${label}: ${bump("results", byCat, 5)}.`;
  }

  return `In ${label}: ${stats.total} results — ${stats.passed} passed, ${stats.failed} failed, ${stats.ignored} ignored (${stats.passRate.toFixed(
    1
  )}% pass rate). Ask about "why failures changed", "severity", "jira", or "category breakdown".`;
}

export function AiSummary({
  summary,
  flow,
  range,
  stats,
  prevStats,
}: {
  summary: string;
  flow: Flow;
  range: DateRange;
  stats: FlowStats;
  prevStats: FlowStats;
}) {
  const [draft, setDraft] = useState("");
  const [thread, setThread] = useState<QA[]>([]);
  const [aiText, setAiText] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [asking, setAsking] = useState(false);

  // Ask Gemini for the headline summary whenever the flow/window changes.
  // Keyed on primitives so object identity churn doesn't re-fire it.
  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setAiText(null);
    setLoadingSummary(true);
    askAI(
      { mode: "summary", context: buildAiContext(flow, range, stats, prevStats) },
      ctrl.signal
    )
      .then((t) => {
        if (!cancelled) setAiText(t);
      })
      .finally(() => {
        if (!cancelled) setLoadingSummary(false);
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    flow.id,
    range.start,
    range.end,
    stats.passed,
    stats.failed,
    stats.ignored,
    prevStats.passRate,
  ]);

  const ask = async () => {
    const q = draft.trim();
    if (!q || asking) return;
    setDraft("");
    setAsking(true);
    const ctx = buildAiContext(flow, range, stats, prevStats);
    const ai = await askAI({ mode: "ask", question: q, context: ctx });
    setThread((t) => [
      ...t,
      ai
        ? { q, a: ai, source: "gemini" }
        : { q, a: answer(q, flow, range, stats, prevStats), source: "local" },
    ]);
    setAsking(false);
  };

  return (
    <div className="ai-summary">
      <div className="ai-head">
        <span className="ai-spark" aria-hidden>
          ✦
        </span>
        <span className="ai-kicker">AI Summary</span>
        {loadingSummary && <span className="ai-flag">Gemini · thinking…</span>}
        {!loadingSummary && aiText && <span className="ai-flag">Gemini</span>}
      </div>
      <p className="ai-text">{aiText ?? summary}</p>

      {thread.length > 0 && (
        <div className="ai-thread">
          {thread.map((item, i) => (
            <div key={i} className="ai-qa">
              <div className="ai-q">{item.q}</div>
              <div className="ai-a">
                {item.a}
                {item.source === "local" && (
                  <span className="ai-flag"> · offline answer</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="ai-ask">
        <input
          type="text"
          value={draft}
          disabled={asking}
          placeholder="Ask about this data — e.g. “why did failures go up?”"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") ask();
          }}
        />
        <button onClick={ask} disabled={asking}>
          {asking ? "…" : "Ask"}
        </button>
      </div>
    </div>
  );
}
