import type { AiContext } from "./ai";
import type {
  DateRange,
  Flow,
  FlowResult,
  FlowStats,
  TimeframePreset,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Lowercase, alnum-only, underscore-separated — used to match an uploaded
 *  screenshot's filename against a row's identifying column value, so
 *  filename casing/spacing/punctuation differences don't break the match. */
export function sanitizeKey(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Resolve a preset to a concrete {start, end} range. All presets run
 *  through today, inclusive — a file dropped in for today should show up
 *  under "7 days" immediately, not only once it becomes "yesterday". */
export function rangeForPreset(preset: TimeframePreset): DateRange {
  const t = today();
  if (preset === "today") {
    const iso = toISO(t);
    return { start: iso, end: iso };
  }
  const spanByPreset: Record<Exclude<TimeframePreset, "today" | "custom">, number> = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
  };
  const span = spanByPreset[preset as "7d" | "30d" | "90d"] ?? 30;
  const start = new Date(t.getTime() - span * DAY_MS);
  return { start: toISO(start), end: toISO(t) };
}

export function resultsInRange(flow: Flow, range: DateRange): FlowResult[] {
  const { start, end } = range;
  return flow.results.filter((r) => r.date >= start && r.date <= end);
}

export function computeStats(results: FlowResult[]): FlowStats {
  let passed = 0;
  let failed = 0;
  let ignored = 0;
  for (const r of results) {
    if (r.status === "passed") passed++;
    else if (r.status === "failed") failed++;
    else ignored++;
  }
  const denom = passed + failed;
  return {
    total: results.length,
    passed,
    failed,
    ignored,
    passRate: denom === 0 ? 0 : (passed / denom) * 100,
  };
}

/** The equally-long window immediately before `range`, for trend comparison. */
export function previousRange(range: DateRange): DateRange {
  const start = new Date(range.start + "T00:00:00Z").getTime();
  const end = new Date(range.end + "T00:00:00Z").getTime();
  const span = end - start + DAY_MS;
  const prevEnd = new Date(start - DAY_MS);
  const prevStart = new Date(start - span);
  return { start: toISO(prevStart), end: toISO(prevEnd) };
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function fmtDay(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

export function fmtRange(range: DateRange): string {
  if (range.start === range.end) return fmtDay(range.start);
  return `${fmtDay(range.start)} – ${fmtDay(range.end)}`;
}

export function buildAiSummary(
  flow: Flow,
  range: DateRange,
  stats: FlowStats,
  prevStats: FlowStats
): string {
  const label = fmtRange(range);
  const rate = stats.passRate.toFixed(1);
  const delta = stats.passRate - prevStats.passRate;
  const deltaAbs = Math.abs(delta).toFixed(1);

  const health =
    stats.passRate >= 97
      ? "in good shape"
      : stats.passRate >= 90
      ? "worth watching"
      : "under the line";

  const trend =
    prevStats.total === 0
      ? "No comparable previous period."
      : Math.abs(delta) < 0.2
      ? "That’s flat vs the previous period."
      : `That’s ${delta < 0 ? "down" : "up"} ${deltaAbs} pts vs the previous period.`;

  // Top failing category — only meaningful when the source actually has one.
  let catLine = "";
  if (flow.presentColumns?.category ?? true) {
    const byCat = new Map<string, number>();
    for (const r of resultsInRange(flow, range)) {
      if (r.status === "failed") byCat.set(r.category, (byCat.get(r.category) ?? 0) + 1);
    }
    let topCat = "";
    let topCount = 0;
    for (const [cat, n] of byCat) {
      if (n > topCount) {
        topCat = cat;
        topCount = n;
      }
    }
    catLine =
      stats.failed === 0
        ? "No failures in this window."
        : `${topCount} of ${stats.failed} failures are category “${topCat}”.`;
  }

  return [`${flow.name} is ${health} at ${rate}% over ${label}.`, trend, catLine]
    .filter(Boolean)
    .join(" ");
}

/** Compact facts for the Gemini prompt — numbers only, no free reasoning. */
export function buildAiContext(
  flow: Flow,
  range: DateRange,
  stats: FlowStats,
  prevStats: FlowStats
): AiContext {
  const rows = resultsInRange(flow, range);
  const failures = rows.filter((r) => r.status === "failed");

  const tally = (key: (r: FlowResult) => string) => {
    const m: Record<string, number> = {};
    for (const r of failures) m[key(r)] = (m[key(r)] ?? 0) + 1;
    return m;
  };

  return {
    flow: flow.name,
    range: fmtRange(range),
    passRate: Number(stats.passRate.toFixed(1)),
    passed: stats.passed,
    failed: stats.failed,
    ignored: stats.ignored,
    prevPassRate:
      prevStats.total === 0 ? null : Number(prevStats.passRate.toFixed(1)),
    failuresByCategory: tally((r) => r.category),
    failuresBySeverity: tally((r) => r.severity),
    failuresWithJira: failures.filter((r) => r.jira).length,
    sampleFailures: failures.slice(0, 12).map((r) => ({
      id: r.id,
      date: r.date,
      category: r.category,
      severity: r.severity,
      note: r.note,
    })),
  };
}

export function toCsv(rows: FlowResult[], flowName: string): string {
  const extraKeys = [
    ...new Set(rows.flatMap((r) => Object.keys(r.extra ?? {}))),
  ];
  const header = [
    "flow",
    "date",
    "status",
    "id",
    "category",
    "severity",
    "jira",
    "note",
    ...extraKeys,
  ];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        flowName,
        r.date,
        r.status,
        r.id,
        r.category,
        r.severity,
        r.jira ?? "",
        r.note,
        ...extraKeys.map((k) => r.extra?.[k] ?? ""),
      ]
        .map((v) => esc(String(v)))
        .join(",")
    );
  }
  return lines.join("\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
