import * as XLSX from "xlsx";
import type { Flow } from "./types";
import { parseCsvToFlows, slug } from "./parseCsv";
import { sanitizeKey } from "./lib";
import { SAMPLE_FLOWS } from "./sampleData";

/* ------------------------------------------------------------------ *
 * Data source.
 *
 * Every *.xlsx file anywhere under the project's /flows folder (including
 * subfolders) is read at dev-server/runtime and turned into a Flow. Each
 * workbook's first sheet is converted to CSV text and run through the
 * exact same parser as before (parseCsv.ts) — xlsx is just a different
 * container for the same row shape.
 *
 * A flow = every file sitting DIRECTLY in the same folder, merged into
 * one — that's what lets a daily/periodic export (a new file dropped in
 * each day) accumulate into one continuous flow instead of becoming a
 * new flow every time. The folder's name is the flow's name. A folder
 * holding just one file behaves exactly like before: that file is its
 * own flow, named after the file.
 *
 * The bucket (Flow.group) shown in the picker is the folder ONE level
 * above the flow's folder — e.g.:
 *
 *   flows/sharepoint/Tiles/PT-4586/2026-09-01.xlsx   -> flow "PT-4586", bucket "Tiles"
 *   flows/sharepoint/Add a Line/2026-09-17.xlsx       -> flow "Add a Line", no bucket
 *                                                        ("sharepoint" is our own
 *                                                        junction mount-point name,
 *                                                        not a real bucket)
 *   flows/Login Journey.xlsx                          -> flow "Login Journey", no bucket
 *
 * Scanning subfolders is what lets a SharePoint document library that's
 * synced locally via OneDrive be used as a source: create a subfolder
 * under /flows that's a directory junction pointing at the synced
 * SharePoint folder (see flows/README.md), and its files are picked up
 * the same as any other file here.
 *
 * If /flows has no usable .xlsx, the dashboard falls back to the
 * generated SAMPLE_FLOWS so it still renders.
 * ------------------------------------------------------------------ */

// Eagerly resolved to URLs (cheap, synchronous) — the actual file bytes
// are only fetched once loadFlows() is called, since reading a workbook
// is inherently async (fetch + parse).
const xlsxFiles = import.meta.glob("../flows/**/*.xlsx", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;

// Screenshots the team drops alongside a flow's Excel files, named after
// the row's "Unnamed: 0" column value (see components/CombinationsSummary)
// — read as URLs (not raw text) so they can go straight into an <img src>.
const imageFiles = import.meta.glob(
  "../flows/**/*.{png,jpg,jpeg,PNG,JPG,JPEG}",
  { query: "?url", import: "default", eager: true }
) as Record<string, string>;

/** Everything after the "flows" path segment, e.g.
 *  ["sharepoint", "Tiles", "PT-4586", "2026-09-01.xlsx"]. */
function relSegmentsOf(path: string): string[] {
  const segments = path.split("/");
  const flowsIdx = segments.lastIndexOf("flows");
  return flowsIdx >= 0 ? segments.slice(flowsIdx + 1) : segments;
}

/** A daily export named after the day it ran — `YYYY-MM-DD.xlsx` or
 *  `YYYYMMDD.xlsx` — is treated as authoritative for its rows' test date.
 *  Several teams' own `date` column turns out to be a plan/pricing date,
 *  not when the test actually ran, so the filename is the one thing we
 *  can trust. Anything else (e.g. a legacy single-file flow like
 *  "PT5282.xlsx") falls back to the sheet's own date column. */
function dateFromFileName(fileName: string): string | undefined {
  const base = fileName.replace(/\.xlsx$/i, "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(base)) return base;
  if (/^\d{8}$/.test(base)) {
    return `${base.slice(0, 4)}-${base.slice(4, 6)}-${base.slice(6, 8)}`;
  }
  return undefined;
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

/** Columns dropped from every flow in a given (lowercased) bucket — the
 *  team doesn't want them shown for Tiles. Compared normalized (case,
 *  spaces, underscores, dashes ignored). */
const HIDDEN_COLUMNS_BY_BUCKET: Record<string, string[]> = {
  tiles: ["bup", "logfile"],
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[_\s-]+/g, "");
}

function hideColumns(flow: Flow, hidden: string[]): void {
  const drop = new Set(
    (flow.extraColumns ?? []).filter((c) => hidden.includes(normalizeHeader(c)))
  );
  if (drop.size === 0) return;
  const kept = (flow.extraColumns ?? []).filter((c) => !drop.has(c));
  flow.extraColumns = kept.length ? kept : undefined;
  for (const r of flow.results) {
    if (!r.extra) continue;
    for (const c of drop) delete r.extra[c];
  }
}

/** Fetch a workbook and convert its first sheet to CSV text, so the rest
 *  of the pipeline (parseCsv.ts) doesn't need to know xlsx exists. */
async function readFirstSheetAsCsv(url: string): Promise<string> {
  const buf = await fetch(url).then((r) => r.arrayBuffer());
  const workbook = XLSX.read(buf, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_csv(sheet);
}

async function loadFlowsFolder(): Promise<Flow[]> {
  const images = imagesByFolder();

  // Group every file by its immediate containing folder first — everyone
  // in the same folder is the same flow. Reading is async (fetch + parse
  // the workbook), so resolve them all up front.
  const read = await Promise.all(
    Object.entries(xlsxFiles).map(async ([path, url]) => ({
      relSegments: relSegmentsOf(path),
      text: await readFirstSheetAsCsv(url),
    }))
  );

  const byFolder = new Map<string, { relSegments: string[]; text: string }[]>();
  for (const entry of read) {
    const folderKey = entry.relSegments.slice(0, -1).join("/"); // "" = directly in flows/
    const list = byFolder.get(folderKey) ?? [];
    list.push(entry);
    byFolder.set(folderKey, list);
  }

  const flows: Flow[] = [];

  for (const [folderKey, files] of byFolder) {
    const folderSegments = folderKey ? folderKey.split("/") : [];

    if (folderSegments.length === 0) {
      // Loose file directly in flows/ — its own flow, no bucket.
      for (const { relSegments, text } of files) {
        const fileName = relSegments[relSegments.length - 1];
        const nameFromFile = fileName.replace(/\.xlsx$/i, "");
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
    const hidden = group ? HIDDEN_COLUMNS_BY_BUCKET[group.toLowerCase()] : undefined;
    if (hidden) hideColumns(merged, hidden);
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

export interface LoadedFlows {
  flows: Flow[];
  usingSample: boolean;
}

let cached: Promise<LoadedFlows> | null = null;

/** Reads every .xlsx under flows/ once and caches the result — call this
 *  from App on mount rather than importing a top-level constant, since
 *  reading a workbook is inherently async. */
export function loadFlows(): Promise<LoadedFlows> {
  if (!cached) {
    cached = loadFlowsFolder().then((loaded) => {
      const usingSample = loaded.length === 0;
      return { flows: usingSample ? SAMPLE_FLOWS : loaded, usingSample };
    });
  }
  return cached;
}
