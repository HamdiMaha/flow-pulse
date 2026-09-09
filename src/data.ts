import type { Flow } from "./types";
import { parseCsvToFlows } from "./parseCsv";
import { SAMPLE_FLOWS } from "./sampleData";

/* ------------------------------------------------------------------ *
 * Data source.
 *
 * Every *.csv file in the project's /flows folder is read at build /
 * dev-server time and turned into a Flow. The file name is the flow
 * name ("Support Tiles.csv" -> "Support Tiles"), unless the CSV has
 * its own `flow` column, which wins.
 *
 * If /flows has no usable CSV, the dashboard falls back to the
 * generated SAMPLE_FLOWS so it still renders.
 * ------------------------------------------------------------------ */

const csvFiles = import.meta.glob("../flows/*.csv", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function loadFlowsFolder(): Flow[] {
  const flows: Flow[] = [];
  for (const [path, text] of Object.entries(csvFiles)) {
    const fileName = path.split("/").pop() ?? "flow.csv";
    const nameFromFile = fileName.replace(/\.csv$/i, "");
    try {
      const parsed = parseCsvToFlows(text, nameFromFile);
      for (const f of parsed) f.source = `flows/${fileName}`;
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
