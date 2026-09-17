import type { TableFilter } from "../types";
import type { Insights as InsightsData } from "../insights";

/**
 * The tester's actual to-do list, not just totals: what's new since the
 * last run, what's failing with no Jira ticket yet, and what's flaky
 * (so it doesn't get re-triaged as if it were a real regression). Each
 * tile is a shortcut into the results table's matching filter.
 */
export function Insights({
  insights,
  filter,
  onFilter,
}: {
  insights: InsightsData;
  filter: TableFilter;
  onFilter: (f: TableFilter) => void;
}) {
  const items: {
    key: TableFilter;
    label: string;
    value: number;
    hint: string;
    tone: "warn" | "neutral";
  }[] = [
    {
      key: "untracked",
      label: "Untracked failures",
      value: insights.untrackedCount,
      hint: "Failing, no Jira ticket linked",
      tone: "warn",
    },
  ];

  if (insights.canTrackIdentity) {
    items.unshift({
      key: "new",
      label: "New failures",
      value: insights.newFailureCount,
      hint: insights.latestDate
        ? `First time failing, as of ${insights.latestDate}`
        : "First time failing",
      tone: "warn",
    });
    items.push({
      key: "flaky",
      label: "Flaky",
      value: insights.flakyCount,
      hint: "Has passed and failed before — inconsistent, not a clear regression",
      tone: "neutral",
    });
  }

  return (
    <div className="insights">
      {items.map((it) => (
        <button
          key={it.key}
          className={`insight-tile insight-${it.tone}${filter === it.key ? " active" : ""}`}
          onClick={() => onFilter(filter === it.key ? "all" : it.key)}
          title={it.hint}
        >
          <div className="insight-value">{it.value}</div>
          <div className="insight-label">{it.label}</div>
        </button>
      ))}
    </div>
  );
}
