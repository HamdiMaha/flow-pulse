/* ------------------------------------------------------------------ *
 * Per-bucket drill-down column config — which columns a bucket (e.g.
 * "Add a Line", "AGA", "Tiles") wants to filter/drill through, and in
 * what order. Different buckets have completely different columns, so
 * this is never hardcoded: whoever's looking at a bucket picks its
 * columns from what that bucket's flows actually have, via
 * DrillDownConfig, and the choice is remembered locally.
 * ------------------------------------------------------------------ */

const PREFIX = "qa-dashboard:drill:";

function keyFor(bucket: string): string {
  return `${PREFIX}${bucket}`;
}

export function getDrillColumns(bucket: string | undefined): string[] {
  if (!bucket) return [];
  try {
    const raw = localStorage.getItem(keyFor(bucket));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveDrillColumns(bucket: string, columns: string[]): void {
  try {
    if (columns.length === 0) localStorage.removeItem(keyFor(bucket));
    else localStorage.setItem(keyFor(bucket), JSON.stringify(columns));
  } catch {
    // Private browsing / storage disabled — the picker just won't persist.
  }
}
