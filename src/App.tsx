import { useEffect, useMemo, useState } from "react";
import { loadFlows } from "./data";
import type { DateRange, Flow, TableFilter, TimeframePreset } from "./types";
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
import { buildInsights, computeTileLifecycle } from "./insights";
import { FlowPicker } from "./components/FlowPicker";
import { Timeframe } from "./components/Timeframe";
import { StatTiles } from "./components/StatTiles";
import { TileLifecycle } from "./components/TileLifecycle";
import { Insights } from "./components/Insights";
import { AiSummary } from "./components/AiSummary";
import { Breakdown } from "./components/Breakdown";
import { ResultsTable } from "./components/ResultsTable";

// Rendered only for the brief window before loadFlows() resolves — keeps
// every hook below unconditional (Rules of Hooks) instead of needing a
// real flow's worth of data to exist yet.
const EMPTY_FLOW: Flow = {
  id: "__loading__",
  name: "Loading…",
  source: "",
  categories: [],
  results: [],
};

export function App() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [usingSample, setUsingSample] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [flowId, setFlowId] = useState<string>("");
  const [preset, setPreset] = useState<TimeframePreset>("30d");
  const [customRange, setCustomRange] = useState<DateRange>(
    rangeForPreset("30d")
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TableFilter>("all");

  useEffect(() => {
    let cancelled = false;
    loadFlows().then((result) => {
      if (cancelled) return;
      setFlows(result.flows);
      setUsingSample(result.usingSample);
      setFlowId(result.flows[0]?.id ?? "");
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectFlow = (id: string) => {
    setFlowId(id);
    // A filter/search from one flow rarely means anything on another.
    setQuery("");
    setFilter("all");
  };

  const handleBreakdownPick = (value: string) => {
    setQuery(value);
    setFilter("all"); // let the search value drive it, not a stale status tab
  };

  const flow = useMemo(
    () => flows.find((f) => f.id === flowId) ?? flows[0] ?? EMPTY_FLOW,
    [flows, flowId]
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

  const insights = useMemo(() => buildInsights(flow, inRange), [flow, inRange]);
  const tileLifecycle = useMemo(
    () => computeTileLifecycle(flow, inRange),
    [flow, inRange]
  );

  const handlePreset = (p: TimeframePreset) => {
    setPreset(p);
    if (p === "custom") setCustomRange(range);
  };

  if (!loaded) {
    return (
      <div className="app">
        <p className="app-loading">Reading flows…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="page-head">
        <div>
          <h1>QA Dashboard</h1>
          <p className="tagline">
            Select a flow and a timeframe to see its score and every result
            behind it.
          </p>
        </div>
        <span className="preview-badge">
          {usingSample
            ? "Sample data — add .xlsx files to /flows"
            : `Reading ${flows.length} flow${flows.length === 1 ? "" : "s"} from /flows`}
        </span>
      </header>

      <FlowPicker flows={flows} flowId={flowId} onSelect={handleSelectFlow} />

      <section className="card">
        <div className="card-head">
          <div>
            <h2>{flow.name}</h2>
            <p className="showing">Showing {fmtRange(range)}</p>
          </div>
          <div className="card-head-actions">
            <span className="sync-pill">↻ {flow.source}</span>
          </div>
        </div>

        <Timeframe
          preset={preset}
          range={range}
          onPreset={handlePreset}
          onCustomRange={setCustomRange}
        />

        <StatTiles stats={stats} range={range} />

        <TileLifecycle data={tileLifecycle} />

        <Insights insights={insights} filter={filter} onFilter={setFilter} />

        <AiSummary
          summary={summary}
          flow={flow}
          range={range}
          stats={stats}
          prevStats={prevStats}
        />

        <Breakdown flow={flow} results={inRange} onPick={handleBreakdownPick} />

        <ResultsTable
          results={inRange}
          insights={insights}
          extraColumns={flow.extraColumns}
          presentColumns={flow.presentColumns}
          filter={filter}
          onFilterChange={setFilter}
          query={query}
          onQueryChange={setQuery}
          onExport={(rows) =>
            downloadCsv(
              `${flow.id}_${range.start}_${range.end}.csv`,
              toCsv(rows, flow.name)
            )
          }
        />
      </section>

      <footer className="page-foot">
        QA Dashboard · {flow.name} · {stats.total.toLocaleString()} results in
        window
      </footer>
    </div>
  );
}
