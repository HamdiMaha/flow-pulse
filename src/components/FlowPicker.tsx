import { useEffect, useMemo, useState } from "react";
import type { Flow } from "../types";

const ALL = "__all__";
const UNGROUPED = "__ungrouped__";

// Beyond this many real buckets, a chip row would wrap into multiple
// crowded lines just to pick a filter — switch to a compact dropdown
// instead. Below it, chips are one click and more scannable.
const CHIP_LIMIT = 6;

/**
 * Flow selector with an optional bucket row above it (e.g. Tiles /
 * Mobility / BRS — one per immediate subfolder under flows/, see
 * Flow.group in data.ts). The bucket row only renders when at least one
 * flow actually has a group; otherwise this is just the plain dropdown.
 */
export function FlowPicker({
  flows,
  flowId,
  onSelect,
}: {
  flows: Flow[];
  flowId: string;
  onSelect: (id: string) => void;
}) {
  const groups = useMemo(
    () =>
      [...new Set(flows.map((f) => f.group).filter((g): g is string => !!g))].sort(
        (a, b) => a.localeCompare(b)
      ),
    [flows]
  );
  const hasUngrouped = flows.some((f) => !f.group);
  const showBuckets = groups.length > 0;
  const useDropdown = groups.length > CHIP_LIMIT;

  const [bucket, setBucket] = useState<string>(ALL);

  const visible = useMemo(() => {
    if (bucket === ALL) return flows;
    if (bucket === UNGROUPED) return flows.filter((f) => !f.group);
    return flows.filter((f) => f.group === bucket);
  }, [flows, bucket]);

  // Switching bucket can hide the currently selected flow — jump to the
  // first one that's actually visible instead of showing a stale flow.
  useEffect(() => {
    if (visible.length > 0 && !visible.some((f) => f.id === flowId)) {
      onSelect(visible[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const countFor = (g: string) =>
    g === ALL
      ? flows.length
      : g === UNGROUPED
      ? flows.filter((f) => !f.group).length
      : flows.filter((f) => f.group === g).length;

  const option = (f: Flow) => (
    <option key={f.id} value={f.id}>
      {f.name} ({f.results.length})
    </option>
  );

  return (
    <div className="flow-pick">
      {showBuckets && useDropdown && (
        <div className="flow-select-row">
          <label htmlFor="bucket-select">Bucket</label>
          <select
            id="bucket-select"
            value={bucket}
            onChange={(e) => setBucket(e.target.value)}
          >
            <option value={ALL}>All ({countFor(ALL)})</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g} ({countFor(g)})
              </option>
            ))}
            {hasUngrouped && (
              <option value={UNGROUPED}>Other ({countFor(UNGROUPED)})</option>
            )}
          </select>
        </div>
      )}

      {showBuckets && !useDropdown && (
        <div className="bucket-row">
          <button
            className={bucket === ALL ? "chip active" : "chip"}
            onClick={() => setBucket(ALL)}
          >
            All <span className="chip-count">{countFor(ALL)}</span>
          </button>
          {groups.map((g) => (
            <button
              key={g}
              className={bucket === g ? "chip active" : "chip"}
              onClick={() => setBucket(g)}
            >
              {g} <span className="chip-count">{countFor(g)}</span>
            </button>
          ))}
          {hasUngrouped && (
            <button
              className={bucket === UNGROUPED ? "chip active" : "chip"}
              onClick={() => setBucket(UNGROUPED)}
            >
              Other <span className="chip-count">{countFor(UNGROUPED)}</span>
            </button>
          )}
        </div>
      )}

      <div className="flow-select-row">
        <label htmlFor="flow-select">Flow</label>
        <select
          id="flow-select"
          value={flowId}
          onChange={(e) => onSelect(e.target.value)}
        >
          {showBuckets && bucket === ALL ? (
            <>
              {hasUngrouped && (
                <optgroup label="Other">
                  {flows.filter((f) => !f.group).map(option)}
                </optgroup>
              )}
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {flows.filter((f) => f.group === g).map(option)}
                </optgroup>
              ))}
            </>
          ) : (
            visible.map(option)
          )}
        </select>
      </div>
    </div>
  );
}
