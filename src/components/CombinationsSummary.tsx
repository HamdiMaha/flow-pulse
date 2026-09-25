import { useEffect, useMemo, useState } from "react";
import type { Flow, FlowResult, TableFilter } from "../types";
import { fmtDay, sanitizeKey } from "../lib";

/* ------------------------------------------------------------------ *
 * "Combinations Summary" view — hardcoded per bucket (AGA, Tiles), not a
 * general per-bucket setting: cascading dropdown filters over that
 * bucket's key columns, a summary table (one row per unique combination
 * + success rate), and picking a row reveals "Detailed annotations for
 * selected combo" (every column for the matching raw rows).
 *
 * AGA additionally shows a screenshot when a detail row is picked,
 * matched by the raw value of the sheet's "Unnamed: 0" column (a stray
 * index column common in pandas-exported Excel files).
 * ------------------------------------------------------------------ */

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

export interface ComboField {
  label: string;
  get: (r: FlowResult) => string;
}

export interface ComboConfig {
  fields: ComboField[];
  /** Column whose value names the row's screenshot; null = no screenshots. */
  imageColumn: string | null;
  screenshots: boolean;
}

function extraField(label: string, column: string): ComboField {
  return { label, get: (r) => r.extra?.[column] || "(blank)" };
}

const AGA_FIELDS = [
  { label: "Entrypoint", aliases: ["entrypoint"] },
  { label: "Line Calculator", aliases: ["linecalculator", "linecalc"] },
  { label: "Plan", aliases: ["plan"] },
  { label: "Region", aliases: ["region"] },
] as const;

const IMAGE_COLUMN_ALIASES = ["unnamed0", "unnamed:0"];

/** Which combination view (if any) applies to this flow, resolved from
 *  its bucket/name and whichever of the required columns it really has —
 *  null means "use the plain Results Table". */
export function resolveComboConfig(flow: Flow): ComboConfig | null {
  const extraColumns = flow.extraColumns ?? [];
  const bucket = flow.group?.toLowerCase();
  const name = flow.name.toLowerCase();

  // AGA can be a bucket or, when its daily files sit directly in an "AGA"
  // folder, the flow's own name (see flows/README.md).
  if (bucket === "aga" || name === "aga") {
    const cols = AGA_FIELDS.map((f) => findColumn(extraColumns, f.aliases));
    if (cols.some((c) => !c)) return null;
    return {
      fields: AGA_FIELDS.map((f, i) => extraField(f.label, cols[i] as string)),
      imageColumn: findColumn(extraColumns, IMAGE_COLUMN_ALIASES),
      screenshots: true,
    };
  }

  if (bucket === "tiles" || name === "tiles") {
    const userId = findColumn(extraColumns, ["userid"]);
    const tileName = findColumn(extraColumns, ["tilenm", "tilename"]);
    if (!userId || !tileName || !(flow.presentColumns?.id ?? true)) return null;
    return {
      fields: [
        extraField("User ID", userId),
        { label: "Tile ID", get: (r) => r.id || "(blank)" },
        extraField("Tile Name", tileName),
      ],
      imageColumn: null,
      screenshots: false,
    };
  }

  return null;
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
  config,
}: {
  flow: Flow;
  results: FlowResult[];
  config: ComboConfig;
}) {
  const { fields } = config;

  const [selections, setSelections] = useState<string[]>([]);
  const [successRateFilter, setSuccessRateFilter] = useState("");
  const [summaryPick, setSummaryPick] = useState<Record<string, string> | null>(null);
  const [detailPick, setDetailPick] = useState<FlowResult | null>(null);
  const [statusFilter, setStatusFilter] = useState<TableFilter>("all");

  useEffect(() => {
    setSelections([]);
    setSuccessRateFilter("");
    setSummaryPick(null);
    setDetailPick(null);
    setStatusFilter("all");
  }, [flow.id]);

  const setSelectionAt = (i: number, v: string) => {
    setSelections((prev) => {
      const next = prev.slice(0, i);
      if (v) next[i] = v;
      return next;
    });
    setSuccessRateFilter("");
    setSummaryPick(null);
    setDetailPick(null);
  };

  const optionsFor = (i: number): string[] => {
    const pool = results.filter((r) =>
      selections.slice(0, i).every((v, j) => !v || fields[j].get(r) === v)
    );
    return [...new Set(pool.map((r) => fields[i].get(r)))].sort((a, b) =>
      a.localeCompare(b)
    );
  };

  const scoped = useMemo(
    () =>
      results.filter((r) =>
        selections.every((v, i) => !v || fields[i].get(r) === v)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results, selections, config]
  );

  const summaryRows: SummaryRow[] = useMemo(() => {
    const map = new Map<string, SummaryRow>();
    for (const r of scoped) {
      const values: Record<string, string> = {};
      for (const f of fields) values[f.label] = f.get(r);
      const key = fields.map((f) => values[f.label]).join(KEY_SEP);
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
  }, [scoped, config]);

  // Success Rate isn't a raw column — it's computed per combination, so
  // its dropdown lists whatever rates actually show up in the summary
  // table right now (after the other filters), not a cascading per-row
  // value like the others.
  const successRateOptions = useMemo(
    () =>
      [...new Set(summaryRows.map((r) => Math.round(r.passRate)))].sort((a, b) => a - b),
    [summaryRows]
  );

  const filteredSummaryRows = successRateFilter
    ? summaryRows.filter((r) => String(Math.round(r.passRate)) === successRateFilter)
    : summaryRows;

  const detailRows = useMemo(() => {
    if (!summaryPick) return [];
    return scoped.filter((r) => fields.every((f) => f.get(r) === summaryPick[f.label]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, summaryPick, config]);

  const visibleDetailRows =
    statusFilter === "all" ? detailRows : detailRows.filter((r) => r.status === statusFilter);
  const statusTabs: { key: TableFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "passed", label: "Passed" },
    { key: "failed", label: "Failed" },
    { key: "ignored", label: "Ignored" },
  ];

  const showId = flow.presentColumns?.id ?? true;
  const showCategory = flow.presentColumns?.category ?? true;
  const showSeverity = flow.presentColumns?.severity ?? true;
  const showJira = flow.presentColumns?.jira ?? true;
  const extraCols = flow.extraColumns ?? [];

  const imgKey =
    config.imageColumn && detailPick
      ? sanitizeKey(detailPick.extra?.[config.imageColumn] ?? "")
      : "";
  const imgUrl = imgKey ? flow.imagesByKey?.[imgKey] : undefined;

  return (
    <div className="combo">
      <h3 className="combo-title">Combinations Summary</h3>

      <div className="drill-filters">
        {fields.map((f, i) => (
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
        <div className="drill-filter">
          <label htmlFor="combo-success-rate">Success Rate</label>
          <select
            id="combo-success-rate"
            value={successRateFilter}
            onChange={(e) => {
              setSuccessRateFilter(e.target.value);
              setSummaryPick(null);
              setDetailPick(null);
            }}
          >
            <option value="">All</option>
            {successRateOptions.map((v) => (
              <option key={v} value={v}>
                {v}%
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {fields.map((f) => (
                <th key={f.label}>{f.label}</th>
              ))}
              <th>Success Rate</th>
            </tr>
          </thead>
          <tbody>
            {filteredSummaryRows.map((row) => {
              const key = fields.map((f) => row.values[f.label]).join(KEY_SEP);
              const isActive =
                !!summaryPick && fields.every((f) => summaryPick[f.label] === row.values[f.label]);
              return (
                <tr
                  key={key}
                  className={isActive ? "drill-row active" : "drill-row"}
                  onClick={() => {
                    setSummaryPick(row.values);
                    setDetailPick(null);
                    setStatusFilter("all");
                  }}
                >
                  {fields.map((f) => (
                    <td key={f.label}>{row.values[f.label]}</td>
                  ))}
                  <td className={row.passRate < 90 ? "breakdown-rate-low" : ""}>
                    {row.passRate.toFixed(0)}%
                  </td>
                </tr>
              );
            })}
            {filteredSummaryRows.length === 0 && (
              <tr>
                <td colSpan={fields.length + 1} className="empty">
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
          <div className="filter-tabs">
            {statusTabs.map((t) => (
              <button
                key={t.key}
                className={statusFilter === t.key ? "ftab active" : "ftab"}
                onClick={() => {
                  setStatusFilter(t.key);
                  setDetailPick(null);
                }}
              >
                {t.label}{" "}
                <span className="ftab-count">
                  {t.key === "all"
                    ? detailRows.length
                    : detailRows.filter((r) => r.status === t.key).length}
                </span>
              </button>
            ))}
          </div>
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
                {visibleDetailRows.map((r, i) => (
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
                {visibleDetailRows.length === 0 && (
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

      {config.screenshots && detailPick && (
        <div className="drill-image">
          {imgUrl ? (
            <img src={imgUrl} alt={`Screenshot for ${detailPick.id}`} />
          ) : (
            <p className="drill-image-empty">
              {config.imageColumn
                ? "No matching image found for this row's “Unnamed: 0” value."
                : "This flow has no “Unnamed: 0” column, so screenshots can't be matched."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
