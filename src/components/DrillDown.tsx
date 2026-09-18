import { useEffect, useMemo, useState } from "react";
import type { Flow, FlowResult } from "../types";
import { fmtDay } from "../lib";

const LABELS: Record<string, string> = {
  category: "Category",
  severity: "Severity",
};

function labelOf(c: string): string {
  return LABELS[c] ?? c;
}

function valueOf(r: FlowResult, col: string): string {
  switch (col) {
    case "category":
      return r.category;
    case "severity":
      return r.severity;
    default:
      return r.extra?.[col] || "(blank)";
  }
}

interface SummaryRow {
  values: Record<string, string>;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
}

const KEY_SEP = "␟"; // unlikely to appear in real data

/**
 * The team's requested view for buckets with a configured drill order
 * (see DrillDownConfig): a chain of dependent filters (each one narrows
 * the next), a summary table of pass rate per unique combination, a
 * detail table of the raw rows behind whichever combination is picked,
 * and — picking a row there — its matching screenshot, if the team
 * uploaded one (see Flow.imagesByKey / FlowResult.imageKey).
 */
export function DrillDown({
  flow,
  results,
  columns,
}: {
  flow: Flow;
  results: FlowResult[];
  columns: string[];
}) {
  const [selections, setSelections] = useState<string[]>([]);
  const [summaryPick, setSummaryPick] = useState<Record<string, string> | null>(null);
  const [detailPick, setDetailPick] = useState<FlowResult | null>(null);

  // Switching flow or reconfiguring the drill columns invalidates
  // whatever was picked before.
  useEffect(() => {
    setSelections([]);
    setSummaryPick(null);
    setDetailPick(null);
  }, [flow.id, columns.join("|")]);

  const setSelectionAt = (i: number, v: string) => {
    setSelections((prev) => {
      const next = prev.slice(0, i);
      if (v) next[i] = v;
      return next;
    });
    setSummaryPick(null);
    setDetailPick(null);
  };

  const optionsFor = (i: number): string[] => {
    const pool = results.filter((r) =>
      selections.slice(0, i).every((v, j) => !v || valueOf(r, columns[j]) === v)
    );
    return [...new Set(pool.map((r) => valueOf(r, columns[i])))].sort((a, b) =>
      a.localeCompare(b)
    );
  };

  const scoped = useMemo(
    () =>
      results.filter((r) =>
        selections.every((v, i) => !v || valueOf(r, columns[i]) === v)
      ),
    [results, selections, columns]
  );

  const summaryRows: SummaryRow[] = useMemo(() => {
    const map = new Map<string, SummaryRow>();
    for (const r of scoped) {
      const values: Record<string, string> = {};
      for (const c of columns) values[c] = valueOf(r, c);
      const key = columns.map((c) => values[c]).join(KEY_SEP);
      let row = map.get(key);
      if (!row) {
        row = { values, total: 0, passed: 0, failed: 0, passRate: 0 };
        map.set(key, row);
      }
      row.total++;
      if (r.status === "passed") row.passed++;
      else if (r.status === "failed") row.failed++;
    }
    return [...map.values()]
      .map((r) => ({
        ...r,
        passRate: r.passed + r.failed === 0 ? 100 : (r.passed / (r.passed + r.failed)) * 100,
      }))
      .sort((a, b) => a.passRate - b.passRate || b.total - a.total);
  }, [scoped, columns]);

  const detailRows = useMemo(() => {
    if (!summaryPick) return [];
    return scoped.filter((r) => columns.every((c) => valueOf(r, c) === summaryPick[c]));
  }, [scoped, summaryPick, columns]);

  const extraCols = flow.extraColumns ?? [];
  const imgUrl = detailPick ? flow.imagesByKey?.[detailPick.imageKey ?? ""] : undefined;

  return (
    <div className="drill">
      <div className="drill-filters">
        {columns.map((c, i) => (
          <div className="drill-filter" key={c}>
            <label htmlFor={`drill-${c}`}>{labelOf(c)}</label>
            <select
              id={`drill-${c}`}
              value={selections[i] ?? ""}
              onChange={(e) => setSelectionAt(i, e.target.value)}
            >
              <option value="">All</option>
              {optionsFor(i).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c}>{labelOf(c)}</th>
              ))}
              <th>Pass rate</th>
              <th>Results</th>
            </tr>
          </thead>
          <tbody>
            {summaryRows.map((row) => {
              const key = columns.map((c) => row.values[c]).join(KEY_SEP);
              const isActive =
                !!summaryPick && columns.every((c) => summaryPick[c] === row.values[c]);
              return (
                <tr
                  key={key}
                  className={isActive ? "drill-row active" : "drill-row"}
                  onClick={() => {
                    setSummaryPick(row.values);
                    setDetailPick(null);
                  }}
                >
                  {columns.map((c) => (
                    <td key={c}>{row.values[c]}</td>
                  ))}
                  <td className={row.passRate < 90 ? "breakdown-rate-low" : ""}>
                    {row.passRate.toFixed(0)}%
                  </td>
                  <td>{row.total}</td>
                </tr>
              );
            })}
            {summaryRows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 2} className="empty">
                  No results match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {summaryPick && (
        <div className="drill-detail">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Status</th>
                  <th>ID</th>
                  {extraCols.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detailRows.map((r, i) => (
                  <tr
                    key={`${r.id}-${i}`}
                    className={detailPick === r ? "drill-row active" : "drill-row"}
                    onClick={() => setDetailPick(r)}
                  >
                    <td className="c-date">{fmtDay(r.date)}</td>
                    <td>
                      <span className={`badge badge-${r.status}`}>
                        {r.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="c-id">{r.id}</td>
                    {extraCols.map((c) => (
                      <td key={c} className="c-extra">
                        {r.extra?.[c] || "–"}
                      </td>
                    ))}
                  </tr>
                ))}
                {detailRows.length === 0 && (
                  <tr>
                    <td colSpan={3 + extraCols.length} className="empty">
                      No results.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detailPick && (
        <div className="drill-image">
          {imgUrl ? (
            <img src={imgUrl} alt={`Screenshot for ${detailPick.id}`} />
          ) : (
            <p className="drill-image-empty">
              No matching image found — expected a file named after all of this
              row's column values.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
