import { useMemo, useState } from "react";
import type { Flow, FlowResult } from "../types";

interface DimRow {
  value: string;
  total: number;
  passed: number;
  failed: number;
  ignored: number;
  passRate: number;
}

interface Dimension {
  key: string;
  label: string;
  get: (r: FlowResult) => string;
}

const MAX_ROWS = 8;

/**
 * Turns whichever columns a flow actually has — Category/Severity if
 * present, or any "extra" column like Region, Plan, Province, Offer —
 * into a pick-a-dimension breakdown: pass rate + volume per value,
 * worst-performing first. Clicking a row filters the results table via
 * the shared search query (lifted to App).
 *
 * Columns where every value is unique (e.g. a user id) or identical
 * (no discriminative value) are excluded automatically — no per-bucket
 * hardcoding needed for Add a Line / AGA / Tiles / anything else.
 */
export function Breakdown({
  flow,
  results,
  onPick,
}: {
  flow: Flow;
  results: FlowResult[];
  onPick: (value: string) => void;
}) {
  const dims = useMemo<Dimension[]>(() => {
    const total = results.length;
    if (total === 0) return [];
    const candidates: Dimension[] = [];
    if (flow.presentColumns?.category ?? true) {
      candidates.push({ key: "__category", label: "Category", get: (r) => r.category });
    }
    if (flow.presentColumns?.severity ?? true) {
      candidates.push({ key: "__severity", label: "Severity", get: (r) => r.severity });
    }
    for (const c of flow.extraColumns ?? []) {
      candidates.push({ key: c, label: c, get: (r) => r.extra?.[c] || "(blank)" });
    }
    // Keep only dimensions that actually group rows — not all-unique
    // (e.g. a user/tile id), not all-the-same (no signal either way).
    return candidates.filter((d) => {
      const distinct = new Set(results.map(d.get)).size;
      return distinct > 1 && distinct < total;
    });
  }, [flow, results]);

  const [dimKey, setDimKey] = useState<string | null>(null);
  const activeKey = dims.some((d) => d.key === dimKey) ? dimKey : dims[0]?.key ?? null;
  const active = dims.find((d) => d.key === activeKey);

  const rows: DimRow[] = useMemo(() => {
    if (!active) return [];
    const map = new Map<string, DimRow>();
    for (const r of results) {
      const v = active.get(r);
      let row = map.get(v);
      if (!row) {
        row = { value: v, total: 0, passed: 0, failed: 0, ignored: 0, passRate: 0 };
        map.set(v, row);
      }
      row.total++;
      if (r.status === "passed") row.passed++;
      else if (r.status === "failed") row.failed++;
      else row.ignored++;
    }
    return [...map.values()]
      .map((r) => ({
        ...r,
        passRate: r.passed + r.failed === 0 ? 100 : (r.passed / (r.passed + r.failed)) * 100,
      }))
      .sort((a, b) => a.passRate - b.passRate || b.total - a.total)
      .slice(0, MAX_ROWS);
  }, [results, active]);

  if (dims.length === 0) return null;

  return (
    <div className="breakdown">
      <div className="breakdown-head">
        <span className="breakdown-kicker">Breakdown</span>
        <select
          value={activeKey ?? ""}
          onChange={(e) => setDimKey(e.target.value)}
          aria-label="Break down by"
        >
          {dims.map((d) => (
            <option key={d.key} value={d.key}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
      <div className="breakdown-rows">
        {rows.map((r) => (
          <button
            key={r.value}
            className="breakdown-row"
            onClick={() => onPick(r.value)}
            title={`Filter the table to “${r.value}”`}
          >
            <span className="breakdown-value">{r.value}</span>
            <span className="breakdown-bar-track">
              <span
                className="breakdown-bar-fill"
                style={{ width: `${Math.max(2, r.passRate)}%` }}
                data-low={r.passRate < 90}
              />
            </span>
            <span className="breakdown-rate">{r.passRate.toFixed(0)}%</span>
            <span className="breakdown-count">{r.total}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
