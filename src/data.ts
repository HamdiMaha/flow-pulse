import type { Flow } from "./types";
import { parseCsvToFlows } from "./parseCsv";
import { SAMPLE_FLOWS } from "./sampleData";

/* ------------------------------------------------------------------ *
 * Data source.
 *
 * Every *.csv file anywhere under the project's /flows folder (including
 * subfolders) is read at build / dev-server time and turned into a Flow.
 * The file name is the flow name ("Support Tiles.csv" -> "Support Tiles").
 *
 * Scanning subfolders is what lets a SharePoint document library that's
 * synced locally via OneDrive be used as a source: create a subfolder
 * under /flows that's a directory junction pointing at the synced
 * SharePoint folder (see flows/README.md), and its CSVs are picked up
 * the same as any other file here.
 *
 * A file's immediate parent folder becomes its "bucket" (Flow.group) —
 * e.g. flows/sharepoint/Tiles/PT5282.csv -> group "Tiles". A file sitting
 * directly in flows/ has no group.
 *
 * If /flows has no usable CSV, the dashboard falls back to the
 * generated SAMPLE_FLOWS so it still renders.
 * ------------------------------------------------------------------ */

const csvFiles = import.meta.glob("../flows/**/*.csv", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function loadFlowsFolder(): Flow[] {
  const flows: Flow[] = [];
  for (const [path, text] of Object.entries(csvFiles)) {
    // path looks like "../flows/sharepoint/Tiles/PT5282.csv" — take
    // everything after the "flows" segment so nested paths and the
    // resulting bucket name resolve correctly no matter how deep.
    const segments = path.split("/");
    const flowsIdx = segments.lastIndexOf("flows");
    const relSegments = flowsIdx >= 0 ? segments.slice(flowsIdx + 1) : segments;
    const fileName = relSegments[relSegments.length - 1] ?? "flow.csv";
    const folderSegments = relSegments.slice(0, -1);
    // The immediate parent folder is the bucket ("Tiles", "Mobility", …).
    // A file sitting directly in flows/ has no bucket.
    const group = folderSegments[folderSegments.length - 1];
    const nameFromFile = fileName.replace(/\.csv$/i, "");
    try {
      const parsed = parseCsvToFlows(text, nameFromFile);
      for (const f of parsed) {
        f.source = `flows/${relSegments.join("/")}`;
        f.group = group;
      }
      flows.push(...parsed);
    } catch (err) {
      // Skip an empty or malformed file rather than blanking the app.
      console.warn(`[flows] skipped ${fileName}: ${(err as Error).message}`);
    }
  }
  flows.sort((a, b) => a.name.localeCompare(b.name));
  return flows;
}

const loaded = loadFlowsFolder();

export const USING_SAMPLE = loaded.length === 0;

export const FLOWS: Flow[] = USING_SAMPLE ? SAMPLE_FLOWS : loaded;
