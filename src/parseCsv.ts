import type { Flow, FlowResult, ResultStatus, Severity } from "./types";

/* ------------------------------------------------------------------ *
 * Parse an uploaded CSV into a single Flow — one file, one flow, named
 * after the file (the `defaultFlowName` the caller passes in).
 *
 * Expected columns (header row, case-insensitive, any order):
 *   date, status, id, category, severity, jira, note
 *
 * Only `date` and `status` are required. Any other column (including one
 * literally called "flow", if your export happens to have one) is kept
 * as an "extra" column rather than used to regroup rows — real QA
 * exports often have a `flow`/`suite`/`scenario` field that means
 * something else entirely, so it must never silently override the file
 * name.
 * ------------------------------------------------------------------ */

/** Split one CSV line, honouring "quoted, fields" and "" escapes. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const STATUS_MAP: Record<string, ResultStatus> = {
  // pass
  pass: "passed",
  passed: "passed",
  ok: "passed",
  green: "passed",
  true: "passed",
  yes: "passed",
  y: "passed",
  "1": "passed",
  match: "passed",
  matched: "passed",
  equal: "passed",
  same: "passed",
  identical: "passed",
  // fail
  fail: "failed",
  failed: "failed",
  failure: "failed",
  error: "failed",
  red: "failed",
  false: "failed",
  no: "failed",
  n: "failed",
  "0": "failed",
  nok: "failed",
  ko: "failed",
  mismatch: "failed",
  mismatched: "failed",
  "no match": "failed",
  "not equal": "failed",
  "not matched": "failed",
  different: "failed",
  diff: "failed",
  // ignored
  ignore: "ignored",
  ignored: "ignored",
  skip: "ignored",
  skipped: "ignored",
  muted: "ignored",
  "n/a": "ignored",
  na: "ignored",
  unknown: "ignored",
};

function normStatus(v: string): ResultStatus {
  const s = v.toLowerCase().trim().replace(/[_-]+/g, " ");
  return STATUS_MAP[s] ?? "ignored";
}

function normSeverity(v: string): Severity {
  const s = v.toLowerCase().trim();
  if (s.startsWith("crit") || s === "p1" || s === "blocker") return "Critical";
  if (s.startsWith("high") || s === "p2" || s === "major") return "High";
  if (s.startsWith("low") || s === "p4" || s === "minor" || s === "trivial")
    return "Low";
  return "Medium";
}

/** Accepts 2026-09-01, 2026/09/01, 09/01/2026, or an ISO timestamp. */
function normDate(v: string): string {
  const t = v.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const parts = t.split(/[/.]/);
  if (parts.length === 3) {
    const [a, b, c] = parts;
    if (a.length === 4)
      return `${a}-${b.padStart(2, "0")}-${c.slice(0, 2).padStart(2, "0")}`;
    return `${c.slice(0, 4)}-${a.padStart(2, "0")}-${b.padStart(2, "0")}`;
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? t : d.toISOString().slice(0, 10);
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "imported"
  );
}

export function parseCsvToFlows(text: string, defaultFlowName = "Imported"): Flow[] {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => l.trim() !== "" && !l.trimStart().startsWith("#"));
  if (lines.length < 2) throw new Error("CSV has a header but no data rows.");

  const rawHeader = splitCsvLine(lines[0]).map((h) => h.trim());
  const header = rawHeader.map((h) =>
    h.toLowerCase().replace(/[_\s-]+/g, "")
  );
  // First header (normalised: lowercased, punctuation stripped) that exists.
  const col = (...names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n.replace(/[_\s-]+/g, ""));
      if (i >= 0) return i;
    }
    return -1;
  };

  const iDate = col(
    "date",
    "rundate",
    "testdate",
    "executiondate",
    "executedat",
    "timestamp",
    "datetime",
    "createdat"
  );
  const iStatus = col(
    "status",
    "result",
    "testresult",
    "matchresult",
    "comparisonflag",
    "comparaisonflag", // French spelling
    "comparisonresult",
    "flag",
    "outcome",
    "verdict",
    "passfail"
  );
  const iId = col("id", "testid", "caseid", "testcaseid", "tileid", "checkid");
  const iCategory = col(
    "category",
    "type",
    "tile",
    "tiletype",
    "group",
    "area",
    "component"
  );
  const iSeverity = col("severity", "priority", "sev", "impact");
  const iJira = col("jira", "jirakey", "jiraid", "ticket", "issue", "issuekey", "bug");
  const iNote = col("note", "notes", "comment", "comments", "message", "details", "description");

  if (iDate < 0 || iStatus < 0) {
    throw new Error(
      "CSV needs a date column (date / run_date / timestamp …) and a status " +
        "column (status / result / match_result / comparaison_flag …) in the header row."
    );
  }

  // Every column that isn't one of the six shown with a fixed label goes
  // through as an "extra" column, under its original header — including
  // one literally called "flow"/"suite"/"scenario", if the file has one.
  // `note` stays mapped for search/AI but also appears here under its
  // own header.
  const consumed = new Set(
    [iDate, iStatus, iId, iCategory, iSeverity, iJira].filter((i) => i >= 0)
  );
  const extraIdx = rawHeader
    .map((_, i) => i)
    .filter((i) => !consumed.has(i));
  const extraColumns = extraIdx.map((i) => rawHeader[i] || `column ${i + 1}`);

  const results: FlowResult[] = [];

  for (let r = 1; r < lines.length; r++) {
    const cells = splitCsvLine(lines[r]);

    const extra: Record<string, string> = {};
    for (const i of extraIdx) {
      extra[rawHeader[i] || `column ${i + 1}`] = (cells[i] ?? "").trim();
    }

    results.push({
      id: (iId >= 0 && cells[iId]) || `ROW-${r}`,
      date: normDate(cells[iDate] ?? ""),
      status: normStatus(cells[iStatus] ?? ""),
      category: (iCategory >= 0 && cells[iCategory]) || "Uncategorized",
      severity: normSeverity(iSeverity >= 0 ? cells[iSeverity] ?? "" : ""),
      jira: iJira >= 0 && cells[iJira] ? cells[iJira] : null,
      note: iNote >= 0 ? cells[iNote] ?? "" : "",
      extra: extraColumns.length ? extra : undefined,
    });
  }

  results.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return [
    {
      id: slug(defaultFlowName),
      name: defaultFlowName,
      source: "Uploaded CSV",
      categories: [...new Set(results.map((x) => x.category))],
      results,
      extraColumns: extraColumns.length ? extraColumns : undefined,
    },
  ];
}
