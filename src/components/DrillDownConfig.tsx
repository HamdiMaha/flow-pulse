import { useMemo } from "react";
import type { Flow } from "../types";

const LABELS: Record<string, string> = {
  category: "Category",
  severity: "Severity",
};

/**
 * Lets whoever's looking at a bucket (Add a Line, AGA, Tiles, …) pick
 * which of its columns to drill through and in what order — clicking a
 * column adds it as the next step, clicking it again removes it. Nothing
 * is hardcoded per bucket: the candidate list is just whatever columns
 * this flow's CSVs actually have.
 */
export function DrillDownConfig({
  flow,
  columns,
  onChange,
}: {
  flow: Flow;
  columns: string[];
  onChange: (columns: string[]) => void;
}) {
  const candidates = useMemo(() => {
    const list: string[] = [];
    if (flow.presentColumns?.category ?? true) list.push("category");
    if (flow.presentColumns?.severity ?? true) list.push("severity");
    for (const c of flow.extraColumns ?? []) list.push(c);
    return list;
  }, [flow]);

  if (candidates.length === 0) return null;

  const toggle = (c: string) => {
    onChange(columns.includes(c) ? columns.filter((x) => x !== c) : [...columns, c]);
  };

  return (
    <div className="drill-config">
      <span className="drill-config-label">
        Drill-down columns for “{flow.group}”
      </span>
      <div className="chip-row">
        {candidates.map((c) => {
          const idx = columns.indexOf(c);
          return (
            <button
              key={c}
              className={idx >= 0 ? "chip active" : "chip"}
              onClick={() => toggle(c)}
              title={
                idx >= 0
                  ? `Step ${idx + 1} — click to remove`
                  : "Click to add as the next drill-down step"
              }
            >
              {idx >= 0 && <span className="drill-config-step">{idx + 1}</span>}
              {LABELS[c] ?? c}
            </button>
          );
        })}
      </div>
      {columns.length > 0 && (
        <button className="drill-config-clear" onClick={() => onChange([])}>
          Clear
        </button>
      )}
    </div>
  );
}
