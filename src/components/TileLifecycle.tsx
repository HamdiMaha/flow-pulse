import type { TileLifecycle as TileLifecycleData } from "../insights";

/**
 * Only renders when the flow has recognizable launch/end date columns
 * (e.g. Tiles' tile_launch_dt / tile_end_dt). Answers a question pass
 * rate alone can't: is what's failing even live right now, or are we
 * still triaging a config that already expired.
 */
export function TileLifecycle({ data }: { data: TileLifecycleData | null }) {
  if (!data) return null;
  const { active, expired, upcoming, unknown } = data;

  return (
    <div className="lifecycle">
      <span className="lifecycle-kicker">Tile lifecycle</span>
      <div className="lifecycle-row">
        <span className="lifecycle-pill lifecycle-active">Active {active}</span>
        <span className="lifecycle-pill lifecycle-expired">Expired {expired}</span>
        <span className="lifecycle-pill lifecycle-upcoming">Upcoming {upcoming}</span>
        {unknown > 0 && (
          <span className="lifecycle-pill lifecycle-unknown">Unknown dates {unknown}</span>
        )}
      </div>
    </div>
  );
}
