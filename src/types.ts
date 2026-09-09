export type ResultStatus = "passed" | "failed" | "ignored";

export type Severity = "Low" | "Medium" | "High" | "Critical";

export interface FlowResult {
  id: string;
  /** ISO date, midnight UTC */
  date: string;
  status: ResultStatus;
  category: string;
  severity: Severity;
  jira: string | null;
  note: string;
  /** Any CSV columns that aren't one of the mapped fields, keyed by their
   *  original header. Shown as extra table columns. */
  extra?: Record<string, string>;
}

export interface Flow {
  id: string;
  name: string;
  /** Where the flow's data is synced from, shown as a pill on the card. */
  source: string;
  categories: string[];
  results: FlowResult[];
  /** Original headers of the unmapped CSV columns, in file order. */
  extraColumns?: string[];
}

export type TimeframePreset = "today" | "7d" | "30d" | "90d" | "custom";

export interface DateRange {
  /** ISO date (yyyy-mm-dd) */
  start: string;
  /** ISO date (yyyy-mm-dd) */
  end: string;
}

export interface FlowStats {
  total: number;
  passed: number;
  failed: number;
  ignored: number;
  /** 0–100, computed against passed + failed (ignored excluded). */
  passRate: number;
}
