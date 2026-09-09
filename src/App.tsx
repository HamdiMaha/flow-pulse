import { useMemo, useState } from "react";
import { FLOWS, USING_SAMPLE } from "./data";
import type { DateRange, TimeframePreset } from "./types";
import {
  buildAiSummary,
  computeStats,
  downloadCsv,
  fmtRange,
  previousRange,
  rangeForPreset,
  resultsInRange,
  toCsv,
} from "./lib";
import { Timeframe } from "./components/Timeframe";
import { StatTiles } from "./components/StatTiles";
import { AiSummary } from "./components/AiSummary";
import { ResultsTable } from "./components/ResultsTable";

export function App() {
  const [flowId, setFlowId] = useState(FLOWS[0].id);
  const [preset, setPreset] = useState<TimeframePreset>("30d");
  const [customRange, setCustomRange] = useState<DateRange>(
    rangeForPreset("30d")
  );

  const flow = useMemo(
    () => FLOWS.find((f) => f.id === flowId) ?? FLOWS[0],
    [flowId]
  );

  const range = preset === "custom" ? customRange : rangeForPreset(preset);

  const inRange = useMemo(() => resultsInRange(flow, range), [flow, range]);
  const stats = useMemo(() => computeStats(inRange), [inRange]);

  const prevStats = useMemo(() => {
    const pr = previousRange(range);
    return computeStats(resultsInRange(flow, pr));
  }, [flow, range]);

  const summary = useMemo(
    () => buildAiSummary(flow, range, stats, prevStats),
    [flow, range, stats, prevStats]
  );

  const handlePreset = (p: TimeframePreset) => {
    setPreset(p);
    if (p === "custom") setCustomRange(range);
  };

  return (
    <div className="app">
      <header className="page-head">
        <div>
          <h1>Flow Pulse</h1>
          <p className="tagline">
            Select a flow and a timeframe to see its score and every result
            behind it.
          </p>
        </div>
        <span className="preview-badge">
          {USING_SAMPLE
            ? "Sample data — add CSVs to /flows"
            : `Reading ${FLOWS.length} flow${FLOWS.length === 1 ? "" : "s"} from /flows`}
        </span>
      </header>

      <div className="flow-pick">
        <label htmlFor="flow-select">Flow</label>
        <select
          id="flow-select"
          value={flowId}
          onChange={(e) => setFlowId(e.target.value)}
        >
          {FLOWS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} ({f.results.length})
            </option>
          ))}
        </select>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>{flow.name}</h2>
            <p className="showing">Showing {fmtRange(range)}</p>
          </div>
          <div className="card-head-actions">
            <span className="sync-pill">↻ {flow.source}</span>
            <button className="btn">Edit mapping</button>
          </div>
        </div>

        <Timeframe
          preset={preset}
          range={range}
          onPreset={handlePreset}
          onCustomRange={setCustomRange}
        />

        <StatTiles stats={stats} range={range} />

        <AiSummary
          summary={summary}
          flow={flow}
          range={range}
          stats={stats}
          prevStats={prevStats}
        />

        <ResultsTable
          results={inRange}
          stats={stats}
          extraColumns={flow.extraColumns}
          onExport={(rows) =>
            downloadCsv(
              `${flow.id}_${range.start}_${range.end}.csv`,
              toCsv(rows, flow.name)
            )
          }
        />
      </section>

      <footer className="page-foot">
        Flow Pulse · {flow.name} · {stats.total.toLocaleString()} results in
        window
      </footer>
    </div>
  );
}
