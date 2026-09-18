import type { Flow } from "./types";
import { parseCsvToFlows, sanitizeKey, slug } from "./parseCsv";
import { SAMPLE_FLOWS } from "./sampleData";

/* ------------------------------------------------------------------ *
 * Data source.
 *
 * Every *.csv file anywhere under the project's /flows folder (including
 * subfolders) is read at build / dev-server time and turned into a Flow.
 *
 * A flow = every CSV file sitting DIRECTLY in the same folder, merged
 * into one — that's what lets a daily/periodic export (a new file
 * dropped in each day) accumulate into one continuous flow instead of
 * becoming a new flow every time. The folder's name is the flow's name.
 * A folder holding just one file behaves exactly like before: that file
 * is its own flow, named after the file.
 *
 * The bucket (Flow.group) shown in the picker is the folder ONE level
 * above the flow's folder — e.g.:
 *
 *   flows/sharepoint/Tiles/PT-4586/2026-09-01.csv   -> flow "PT-4586", bucket "Tiles"
 *   flows/sharepoint/Add a Line/2026-09-17.csv       -> flow "Add a Line", no bucket
 *                                                        ("sharepoint" is our own
 *                                                        junction mount-point name,
 *                                                        not a real bucket)
 *   flows/Login Journey.csv                          -> flow "Login Journey", no bucket
 *
 * Scanning subfolders is what lets a SharePoint document library that's
 * synced locally via OneDrive be used as a source: create a subfolder
 * under /flows that's a directory junction pointing at the synced
 * SharePoint folder (see flows/README.md), and its CSVs are picked up
 * the same as any other file here.
 *
 * If /flows has no usable CSV, the dashboard falls back to the
 * generated SAMPLE_FLOWS so it still renders.
 * ------------------------------------------------------------------ */

const csvFiles = import.meta.glob("../flows/**/*.csv", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

// Screenshots the team drops alongside a flow's CSVs, named after every
// column value of the row they belong to (see parseCsv's imageKey) — read
// as URLs (not raw text) so they can go straight into an <img src>.
const imageFiles = import.meta.glob(
  "../flows/**/*.{png,jpg,jpeg,PNG,JPG,JPEG}",
  { query: "?url", import: "default", eager: true }
) as Record<string, string>;

/** Everything after the "flows" path segment, e.g.
 *  ["sharepoint", "Tiles", "PT-4586", "2026-09-01.csv"]. */
function relSegmentsOf(path: string): string[] {
  const segments = path.split("/");
  const flowsIdx = segments.lastIndexOf("flows");
  return flowsIdx >= 0 ? segments.slice(flowsIdx + 1) : segments;
}

/** A daily export named exactly `YYYY-MM-DD.csv` (the convention this
 *  project's README asks for) is treated as authoritative for its rows'
 *  test date — several teams' own `date` column turns out to be a
 *  plan/config date, not when the test actually ran, so the filename is
 *  the one thing we can trust. Anything else (e.g. a legacy single-file
 *  flow like "PT5282.csv") falls back to the CSV's own date column. */
function dateFromFileName(fileName: string): string | undefined {
  const base = fileName.replace(/\.csv$/i, "");
  return /^\d{4}-\d{2}-\d{2}$/.test(base) ? base : undefined;
}

/** Combine same-folder file parts into one Flow. Single-file folders
 *  pass through untouched. */
function mergeFlowParts(name: string, parts: Flow[]): Flow {
  if (parts.length === 1) return parts[0];

  const results = parts.flatMap((f) => f.results);
  results.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const extraColumns = [...new Set(parts.flatMap((f) => f.extraColumns ?? []))];
  const categories = [...new Set(parts.flatMap((f) => f.categories))];
  const presentColumns = {
    id: parts.some((f) => f.presentColumns?.id ?? true),
    category: parts.some((f) => f.presentColumns?.category ?? true),
    severity: parts.some((f) => f.presentColumns?.severity ?? true),
    jira: parts.some((f) => f.presentColumns?.jira ?? true),
  };

  return {
    id: slug(name),
    name,
    source: "", // set by the caller once the merge count is known
    categories,
    results,
    extraColumns: extraColumns.length ? extraColumns : undefined,
    presentColumns,
  };
}

/** Every image found under flows/, grouped by its containing folder and
 *  keyed within that folder by its sanitized filename (no extension). */
function imagesByFolder(): Map<string, Record<string, string>> {
  const map = new Map<string, Record<string, string>>();
  for (const [path, url] of Object.entries(imageFiles)) {
    const relSegments = relSegmentsOf(path);
    const folderKey = relSegments.slice(0, -1).join("/");
    const fileName = relSegments[relSegments.length - 1];
    const key = sanitizeKey(fileName.replace(/\.[a-zA-Z]+$/, ""));
    const rec = map.get(folderKey) ?? {};
    rec[key] = url;
    map.set(folderKey, rec);
  }
  return map;
}

function loadFlowsFolder(): Flow[] {
  const images = imagesByFolder();

  // Group every CSV by its immediate containing folder first — everyone
  // in the same folder is the same flow.
  const byFolder = new Map<string, { relSegments: string[]; text: string }[]>();
  for (const [path, text] of Object.entries(csvFiles)) {
    const relSegments = relSegmentsOf(path);
    const folderKey = relSegments.slice(0, -1).join("/"); // "" = directly in flows/
    const list = byFolder.get(folderKey) ?? [];
    list.push({ relSegments, text });
    byFolder.set(folderKey, list);
  }

  const flows: Flow[] = [];

  for (const [folderKey, files] of byFolder) {
    const folderSegments = folderKey ? folderKey.split("/") : [];

    if (folderSegments.length === 0) {
      // Loose file directly in flows/ — its own flow, no bucket.
      for (const { relSegments, text } of files) {
        const fileName = relSegments[relSegments.length - 1];
        const nameFromFile = fileName.replace(/\.csv$/i, "");
        try {
          const parsed = parseCsvToFlows(text, nameFromFile, dateFromFileName(fileName));
          for (const f of parsed) {
            f.source = `flows/${relSegments.join("/")}`;
            f.imagesByKey = images.get(folderKey);
          }
          flows.push(...parsed);
        } catch (err) {
          console.warn(`[flows] skipped ${fileName}: ${(err as Error).message}`);
        }
      }
      continue;
    }

    const flowName = folderSegments[folderSegments.length - 1];
    const bucketRaw = folderSegments[folderSegments.length - 2];
    const group =
      bucketRaw && bucketRaw.toLowerCase() !== "sharepoint" ? bucketRaw : undefined;

    const parts: Flow[] = [];
    for (const { relSegments, text } of files) {
      try {
        const fileName = relSegments[relSegments.length - 1];
        parts.push(...parseCsvToFlows(text, flowName, dateFromFileName(fileName)));
      } catch (err) {
        console.warn(`[flows] skipped ${relSegments.join("/")}: ${(err as Error).message}`);
      }
    }
    if (parts.length === 0) continue;

    const merged = mergeFlowParts(flowName, parts);
    merged.group = group;
    merged.imagesByKey = images.get(folderKey);
    merged.source =
      parts.length > 1
        ? `flows/${folderKey} · ${parts.length} files merged`
        : `flows/${files[0].relSegments.join("/")}`;
    flows.push(merged);
  }

  flows.sort((a, b) => a.name.localeCompare(b.name));
  return flows;
}

const loaded = loadFlowsFolder();

export const USING_SAMPLE = loaded.length === 0;

export const FLOWS: Flow[] = USING_SAMPLE ? SAMPLE_FLOWS : loaded;
