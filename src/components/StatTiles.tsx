import type { FlowStats } from "../types";
import { fmtRange } from "../lib";
import type { DateRange } from "../types";

export function StatTiles({
  stats,
  range,
}: {
  stats: FlowStats;
  range: DateRange;
}) {
  return (
    <div className="stat-row">
      <div className="passrate">
        <div className="passrate-value">{stats.passRate.toFixed(1)}%</div>
        <div className="passrate-label">
          Pass rate · {fmtRange(range).toUpperCase()}
        </div>
      </div>
      <div className="tile tile-passed">
        <div className="tile-label">Passed</div>
        <div className="tile-value">{stats.passed.toLocaleString()}</div>
      </div>
      <div className="tile tile-failed">
        <div className="tile-label">Failed</div>
        <div className="tile-value">{stats.failed.toLocaleString()}</div>
      </div>
      <div className="tile tile-ignored">
        <div className="tile-label">Ignored</div>
        <div className="tile-value">{stats.ignored.toLocaleString()}</div>
      </div>
    </div>
  );
}
