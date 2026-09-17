import { useEffect, useMemo, useState } from "react";
import type { Flow, FlowResult, FlowStats, TableFilter } from "../types";
import type { Insights } from "../insights";
import { resultKey } from "../insights";
import { fmtDay } from "../lib";

const PAGE = 60;

export function ResultsTable({
  results,
  stats,
  insights,
  extraColumns = [],
  presentColumns,
  filter,
  onFilterChange,
  query,
  onQueryChange,
  onExport,
}: {
  results: FlowResult[];
  stats: FlowStats;
  insights: Insights;
  extraColumns?: string[];
  presentColumns?: Flow["presentColumns"];
  /** Lifted to App so the Insights panel can drive these too. */
  filter: TableFilter;
  onFilterChange: (f: TableFilter) => void;
  query: string;
  onQueryChange: (q: string) => void;
  onExport: (rows: FlowResult[]) => void;
}) {
  const [limit, setLimit] = useState(PAGE);

  // Reset pagination whenever the query or filter changes, including
  // externally (an Insights/Breakdown click), not just from the UI here.
  useEffect(() => {
    setLimit(PAGE);
  }, [query, filter]);

  // Undefined presentColumns (e.g. the generated sample flows) means "show
  // everything", matching the original always-on behavior.
  const showId = presentColumns?.id ?? true;
  const showCategory = presentColumns?.category ?? true;
  const showSeverity = presentColumns?.severity ?? true;
  const showJira = presentColumns?.jira ?? true;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return results.filter((r) => {
      switch (filter) {
        case "all":
          break;
        case "untracked":
          if (!(r.status === "failed" && !r.jira)) return false;
          break;
        case "new":
          if (!insights.newFailureKeys.has(resultKey(r))) return false;
          break;
        case "flaky":
          if (!insights.flakyIds.has(r.id)) return false;
          break;
        default:
          if (r.status !== filter) return false;
      }
      if (!q) return true;
      return (
        r.id.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        (r.jira ?? "").toLowerCase().includes(q) ||
        r.note.toLowerCase().includes(q) ||
        Object.values(r.extra ?? {}).some((v) => v.toLowerCase().includes(q))
      );
    });
  }, [results, filter, query, insights]);

  const shown = filtered.slice(0, limit);
  const colCount =
    2 + // date, status
    (showId ? 1 : 0) +
    (showCategory ? 1 : 0) +
    (showSeverity ? 1 : 0) +
    (showJira ? 1 : 0) +
    extraColumns.length;

  const tabs: { key: TableFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: stats.total },
    { key: "passed", label: "Passed", count: stats.passed },
    { key: "failed", label: "Failed", count: stats.failed },
    { key: "ignored", label: "Ignored", count: stats.ignored },
    { key: "untracked", label: "Untracked", count: insights.untrackedCount },
    ...(insights.canTrackIdentity
      ? ([
          { key: "new", label: "New", count: insights.newFailureCount },
          { key: "flaky", label: "Flaky", count: insights.flakyCount },
        ] as const)
      : []),
  ];

  return (
    <div className="results">
      <div className="results-toolbar">
        <div className="filter-tabs">
          {tabs.map((t) => (
            <button
              key={t.key}
              className={filter === t.key ? "ftab active" : "ftab"}
              onClick={() => onFilterChange(t.key)}
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
          onChange={(e) => onQueryChange(e.target.value)}
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
                  {insights.canTrackIdentity && insights.newFailureKeys.has(resultKey(r)) && (
                    <span className="badge-flag badge-new" title="First time this has failed">
                      NEW
                    </span>
                  )}
                  {insights.canTrackIdentity && insights.flakyIds.has(r.id) && (
                    <span className="badge-flag badge-flaky" title="Has both passed and failed before — inconsistent">
                      ⚡ FLAKY
                    </span>
                  )}
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
