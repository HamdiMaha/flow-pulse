import type { DateRange, TimeframePreset } from "../types";

const PRESETS: { key: TimeframePreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "custom", label: "Custom" },
];

export function Timeframe({
  preset,
  range,
  onPreset,
  onCustomRange,
}: {
  preset: TimeframePreset;
  range: DateRange;
  onPreset: (p: TimeframePreset) => void;
  onCustomRange: (r: DateRange) => void;
}) {
  const customActive = preset === "custom";

  return (
    <div className="timeframe">
      <div className="chip-row">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            className={preset === p.key ? "chip active" : "chip"}
            onClick={() => onPreset(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="date-inputs">
        <input
          type="date"
          value={range.start}
          max={range.end}
          disabled={!customActive}
          onChange={(e) => onCustomRange({ ...range, start: e.target.value })}
        />
        <span className="dash">–</span>
        <input
          type="date"
          value={range.end}
          min={range.start}
          disabled={!customActive}
          onChange={(e) => onCustomRange({ ...range, end: e.target.value })}
        />
      </div>
    </div>
  );
}
