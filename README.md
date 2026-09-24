# QA Dashboard

A QA dashboard for test **flows**: pick a flow and a timeframe to see its pass
rate and every result behind it.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build to dist/
```

## What's here

| Area | Behaviour |
| --- | --- |
| **Flow picker** | Switch between flows; count in parens is lifetime result volume. A flow = every `.xlsx` file in one folder merged together (drop in a new daily export and it joins the same flow, filtered by whatever Timeframe you pick — see `flows/README.md`). Flows can be grouped into buckets (the folder one level above), shown as chips, or a compact dropdown past 6 buckets. |
| **Timeframe** | `Today / 7 / 30 / 90 days` presets, or `Custom` with two date pickers. |
| **Pass rate** | `passed / (passed + failed)` — ignored results are excluded. |
| **Stat tiles** | Passed / Failed / Ignored counts for the window. |
| **AI summary** | Gemini-written summary + **Ask** box (see below). Falls back to a rule-based sentence when no key is set. |
| **Insights** | A tester's actual to-do list, not just totals: **New failures** (failing today, wasn't failing before) and **Flaky** (genuine pass↔fail oscillation, 2+ transitions — distinct from a fresh regression). Needs an id that repeats across dates to mean anything — hidden entirely otherwise (e.g. the sample flows). Click a tile to filter the table; click again to clear. |
| **Tile lifecycle** | Only for flows with launch/end date columns (e.g. Tiles' `tile_launch_dt`/`tile_end_dt`): counts of Active / Expired / Upcoming, so a failure on an already-expired config doesn't get chased as a live bug. Hidden when the flow has no such columns. |
| **Pass rate by …** (Breakdown) | Pick any column the flow actually has (Category/Severity, or any extra column like Region, Plan, Province, Offer) and see pass rate + volume per value, worst first — plain numbers, color-coded (red under 90%), no bar chart (a bar scaled to pass rate makes the worst performers the *least* visually prominent, and ignores sample size — rejected on purpose). Click a value to filter the table. Auto-hides columns that are all-unique (ids) or all-identical (no signal), and hides entirely if nothing meaningful to group by. |
| **Results table** | Fixed columns (Date, Status, ID, Category, Severity, Jira) **plus one column per extra header in the sheet**. Filter tabs — All/Passed/Failed/Ignored plus New/Flaky when trackable — recompute against whatever's currently searched (type "MFA" and the tab counts narrow to just that). Free-text search (incl. extra columns, driven by Breakdown/Insights clicks too), `Export CSV` of the current filter, incremental "show more". NEW/FLAKY badges shown inline per row. Every bucket except AGA (see below). |
| **Combinations Summary** (AGA only) | Hardcoded to the AGA bucket specifically (not a general per-bucket setting), and only when AGA's flows actually have Entrypoint/Line Calculator/Plan/Region columns. Replaces the Results Table with: 4 cascading dropdown filters (each narrows the next), a "Combinations Summary" table — one row per unique combination of those columns, with Success Rate — click a row for "Detailed annotations for selected combo" (every column for the matching raw rows), click a row there for its screenshot if the team uploaded one, matched by the row's `Unnamed: 0` column value (a stray index column from pandas-exported Excel files). Screenshot must sit in the same folder as that day's `.xlsx`. |

## AI Summary (Gemini)

Optional. With no key, the summary and Ask box use built-in rule-based text and
the app runs normally.

To enable Gemini:

```bash
cp .env.example .env
# then edit .env:  GEMINI_API_KEY=...   (free key: https://aistudio.google.com/apikey)
npm run dev
```

`src/ai.ts` POSTs the flow's stats to `/api/ai`, a dev-server route defined in
`vite.config.ts` that holds the key and calls `gemini-2.0-flash` (same model as
SiteAnalyzer). The key stays server-side — it is never bundled into the browser.
Any failure (no key, offline, API error) falls back to the rule-based text.

The `/api/ai` route only runs under `npm run dev`. A real deployment needs an
actual backend endpoint.

## Data

The dashboard reads every `*.xlsx` file in [`flows/`](flows/) — one file per
flow, file name = flow name (its **first sheet** is what's read; other sheets
in the same workbook are ignored). Save a file, and the dev server reloads
with it. Empty the folder to fall back to generated sample data. Format and
columns are documented in [`flows/README.md`](flows/README.md).

Run `node scripts/make-sample-xlsx.mjs` to regenerate example `.xlsx` files
in `flows/` if you want something to look at locally.

```
flows/
  README.md      column/format docs

src/
  data.ts        reads flows/*.xlsx (via import.meta.glob, fetched + parsed
                 async with the xlsx package), merges per-folder daily files
                 into one flow each, else SAMPLE_FLOWS
  parseCsv.ts    CSV text -> Flow[] (each workbook's first sheet is converted
                 to CSV text via XLSX.utils.sheet_to_csv before this runs)
  sampleData.ts  seeded generated fallback data
  ai.ts          client for the /api/ai (Gemini) endpoint
  lib.ts         date-range math, stats, rule-based summary, AI context, CSV export
  types.ts       shared types
  App.tsx        state + layout; loads flows async on mount via data.ts
  insights.ts    New/Flaky detection, tile lifecycle
  components/    FlowPicker, Timeframe, StatTiles, TileLifecycle, Insights,
                 AiSummary, Breakdown, ResultsTable, CombinationsSummary
                 (AGA-only, see above)
```

To go live later, replace `src/data.ts`'s `loadFlows()` with a fetch to an API
that returns the same `Flow[]` shape — nothing else changes.
