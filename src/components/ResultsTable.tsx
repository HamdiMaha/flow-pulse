import { useMemo, useState } from "react";
import type { Flow, FlowResult, FlowStats, ResultStatus } from "../types";
import { fmtDay } from "../lib";

type Filter = "all" | ResultStatus;

const PAGE = 60;

export function ResultsTable({
  results,
  stats,
  extraColumns = [],
  presentColumns,
  onExport,
}: {
  results: FlowResult[];
  stats: FlowStats;
  extraColumns?: string[];
  presentColumns?: Flow["presentColumns"];
  onExport: (rows: FlowResult[]) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);

  // Undefined presentColumns (e.g. the generated sample flows) means "show
  // everything", matching the original always-on behavior.
  const showId = presentColumns?.id ?? true;
  const showCategory = presentColumns?.category ?? true;
  const showSeverity = presentColumns?.severity ?? true;
  const showJira = presentColumns?.jira ?? true;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return results.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (!q) return true;
      return (
        r.id.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        (r.jira ?? "").toLowerCase().includes(q) ||
        r.note.toLowerCase().includes(q) ||
        Object.values(r.extra ?? {}).some((v) => v.toLowerCase().includes(q))
      );
    });
  }, [results, filter, query]);

  const shown = filtered.slice(0, limit);
  const colCount =
    2 + // date, status
    (showId ? 1 : 0) +
    (showCategory ? 1 : 0) +
    (showSeverity ? 1 : 0) +
    (showJira ? 1 : 0) +
    extraColumns.length;

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: stats.total },
    { key: "passed", label: "Passed", count: stats.passed },
    { key: "failed", label: "Failed", count: stats.failed },
    { key: "ignored", label: "Ignored", count: stats.ignored },
  ];

  return (
    <div className="results">
      <div className="results-toolbar">
        <div className="filter-tabs">
          {tabs.map((t) => (
            <button
              key={t.key}
              className={filter === t.key ? "ftab active" : "ftab"}
              onClick={() => {
                setFilter(t.key);
                setLimit(PAGE);
              }}
            >
              {t.label} <span className="ftab-count">{t.count}</span>
            </button>
          ))}
        </div>
        <input
          className="search"
          type="search"
          placeholder="Search id, jira, notes…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE);
          }}
        />
        <button className="btn" onClick={() => onExport(filtered)}>
          Export CSV
        </button>
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
              {extraColumns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              // r.id comes from the source data (e.g. a "tile_id" column)
              // and isn't guaranteed unique per row — some real exports
              // repeat it across many rows. Index it too so React never
              // collides two rows onto the same key (which corrupts
              // rendering exactly where filtering seems "broken").
              <tr key={`${r.id}-${i}`}>
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
                {extraColumns.map((c) => (
                  <td key={c} className="c-extra">
                    {r.extra?.[c] || "–"}
                  </td>
                ))}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={colCount} className="empty">
                  No results match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > limit && (
        <button className="more" onClick={() => setLimit((l) => l + PAGE)}>
          Show more ({filtered.length - limit} remaining)
        </button>
      )}
    </div>
  );
}
