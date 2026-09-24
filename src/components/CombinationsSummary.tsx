import { useEffect, useMemo, useState } from "react";
import type { Flow, FlowResult } from "../types";
import { fmtDay, sanitizeKey } from "../lib";

/* ------------------------------------------------------------------ *
 * AGA-specific view (hardcoded to that bucket, not a general per-bucket
 * config — see conversation history for why): cascading dropdown filters
 * over Entrypoint / Line Calculator / Plan / Region, a "Combinations
 * Summary" table (one row per unique combination + pass rate), and
 * picking a row there reveals "Detailed annotations for selected combo"
 * (every column for the matching raw rows), and picking a row THERE
 * reveals its screenshot if the team uploaded one — matched by the raw
 * value of the sheet's "Unnamed: 0" column (a stray index column common
 * in pandas-exported Excel files).
 * ------------------------------------------------------------------ */

const FIELDS = [
  { label: "Entrypoint", aliases: ["entrypoint"] },
  { label: "Line Calculator", aliases: ["linecalculator", "linecalc"] },
  { label: "Plan", aliases: ["plan"] },
  { label: "Region", aliases: ["region"] },
] as const;

const IMAGE_COLUMN_ALIASES = ["unnamed0", "unnamed:0"];

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[_\s-]+/g, "");
}

function findColumn(extraColumns: string[], aliases: readonly string[]): string | null {
  for (const alias of aliases) {
    const match = extraColumns.find((c) => normalizeHeader(c) === alias);
    if (match) return match;
  }
  return null;
}

interface ComboColumns {
  entrypoint: string;
  lineCalculator: string;
  plan: string;
  region: string;
  imageColumn: string | null;
}

/** Resolves the fixed AGA columns from whatever this flow's actual
 *  headers are — null if any of the four required ones is missing, so
 *  the caller can fall back to the plain Results Table instead. */
export function resolveComboColumns(flow: Flow): ComboColumns | null {
  const extraColumns = flow.extraColumns ?? [];
  const entrypoint = findColumn(extraColumns, FIELDS[0].aliases);
  const lineCalculator = findColumn(extraColumns, FIELDS[1].aliases);
  const plan = findColumn(extraColumns, FIELDS[2].aliases);
  const region = findColumn(extraColumns, FIELDS[3].aliases);
  if (!entrypoint || !lineCalculator || !plan || !region) return null;
  return {
    entrypoint,
    lineCalculator,
    plan,
    region,
    imageColumn: findColumn(extraColumns, IMAGE_COLUMN_ALIASES),
  };
}

interface SummaryRow {
  values: Record<string, string>;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
}

const KEY_SEP = "␟";

export function CombinationsSummary({
  flow,
  results,
  columns,
}: {
  flow: Flow;
  results: FlowResult[];
  columns: ComboColumns;
}) {
  const fieldCols = [
    columns.entrypoint,
    columns.lineCalculator,
    columns.plan,
    columns.region,
  ];

  const [selections, setSelections] = useState<string[]>([]);
  const [summaryPick, setSummaryPick] = useState<Record<string, string> | null>(null);
  const [detailPick, setDetailPick] = useState<FlowResult | null>(null);

  useEffect(() => {
    setSelections([]);
    setSummaryPick(null);
    setDetailPick(null);
  }, [flow.id]);

  const valueOf = (r: FlowResult, col: string) => r.extra?.[col] || "(blank)";

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
      selections.slice(0, i).every((v, j) => !v || valueOf(r, fieldCols[j]) === v)
    );
    return [...new Set(pool.map((r) => valueOf(r, fieldCols[i])))].sort((a, b) =>
      a.localeCompare(b)
    );
  };

  const scoped = useMemo(
    () =>
      results.filter((r) =>
        selections.every((v, i) => !v || valueOf(r, fieldCols[i]) === v)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results, selections]
  );

  const summaryRows: SummaryRow[] = useMemo(() => {
    const map = new Map<string, SummaryRow>();
    for (const r of scoped) {
      const values: Record<string, string> = {};
      for (let i = 0; i < FIELDS.length; i++) values[FIELDS[i].label] = valueOf(r, fieldCols[i]);
      const key = FIELDS.map((f) => values[f.label]).join(KEY_SEP);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped]);

  const detailRows = useMemo(() => {
    if (!summaryPick) return [];
    return scoped.filter((r) =>
      FIELDS.every((f, fi) => valueOf(r, fieldCols[fi]) === summaryPick[f.label])
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, summaryPick]);

  const showId = flow.presentColumns?.id ?? true;
  const showCategory = flow.presentColumns?.category ?? true;
  const showSeverity = flow.presentColumns?.severity ?? true;
  const showJira = flow.presentColumns?.jira ?? true;
  const extraCols = flow.extraColumns ?? [];

  const imgKey =
    columns.imageColumn && detailPick
      ? sanitizeKey(detailPick.extra?.[columns.imageColumn] ?? "")
      : "";
  const imgUrl = imgKey ? flow.imagesByKey?.[imgKey] : undefined;

  return (
    <div className="combo">
      <h3 className="combo-title">Combinations Summary</h3>

      <div className="drill-filters">
        {FIELDS.map((f, i) => (
          <div className="drill-filter" key={f.label}>
            <label htmlFor={`combo-${f.label}`}>{f.label}</label>
            <select
              id={`combo-${f.label}`}
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
              {FIELDS.map((f) => (
                <th key={f.label}>{f.label}</th>
              ))}
              <th>Success Rate</th>
            </tr>
          </thead>
          <tbody>
            {summaryRows.map((row) => {
              const key = FIELDS.map((f) => row.values[f.label]).join(KEY_SEP);
              const isActive =
                !!summaryPick && FIELDS.every((f) => summaryPick[f.label] === row.values[f.label]);
              return (
                <tr
                  key={key}
                  className={isActive ? "drill-row active" : "drill-row"}
                  onClick={() => {
                    setSummaryPick(row.values);
                    setDetailPick(null);
                  }}
                >
                  {FIELDS.map((f) => (
                    <td key={f.label}>{row.values[f.label]}</td>
                  ))}
                  <td className={row.passRate < 90 ? "breakdown-rate-low" : ""}>
                    {row.passRate.toFixed(0)}%
                  </td>
                </tr>
              );
            })}
            {summaryRows.length === 0 && (
              <tr>
                <td colSpan={FIELDS.length + 1} className="empty">
                  No results match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {summaryPick && (
        <div className="drill-detail">
          <h3 className="combo-title">Detailed annotations for selected combo</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Status</th>
                  {showId && <th>ID</th>}
                  {showCategory && <th>Category</th>}
                  {showSeverity && <th>Severity</th>}
                  {showJira && <th>Jira</th>}
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
                    {showId && <td className="c-id">{r.id}</td>}
                    {showCategory && <td>{r.category}</td>}
                    {showSeverity && <td>{r.severity}</td>}
                    {showJira && <td className="c-jira">{r.jira ?? "–"}</td>}
                    {extraCols.map((c) => (
                      <td key={c} className="c-extra">
                        {r.extra?.[c] || "–"}
                      </td>
                    ))}
                  </tr>
                ))}
                {detailRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={
                        2 +
                        (showId ? 1 : 0) +
                        (showCategory ? 1 : 0) +
                        (showSeverity ? 1 : 0) +
                        (showJira ? 1 : 0) +
                        extraCols.length
                      }
                      className="empty"
                    >
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
              {columns.imageColumn
                ? "No matching image found for this row's “Unnamed: 0” value."
                : "This flow has no “Unnamed: 0” column, so screenshots can't be matched."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
