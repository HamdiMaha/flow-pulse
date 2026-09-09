# Flow Pulse

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
| **Flow picker** | Switch between flows; count in parens is lifetime result volume. |
| **Timeframe** | `Today / 7 / 30 / 90 days` presets, or `Custom` with two date pickers. |
| **Pass rate** | `passed / (passed + failed)` — ignored results are excluded. |
| **Stat tiles** | Passed / Failed / Ignored counts for the window. |
| **AI summary** | Gemini-written summary + **Ask** box (see below). Falls back to a rule-based sentence when no key is set. |
| **Results table** | Fixed columns (Date, Status, ID, Category, Severity, Jira) **plus one column per extra header in the CSV**. Filter tabs, free-text search (incl. extra columns), `Export CSV` of the current filter, incremental "show more". |

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

The dashboard reads every `*.csv` file in [`flows/`](flows/) — one file per
flow, file name = flow name. Save a file, and the dev server reloads with it.
Empty the folder to fall back to generated sample data. Format and columns are
documented in [`flows/README.md`](flows/README.md).

```
flows/
  Login Journey.csv      example — overwrite with your own
  Payments Smoke.csv     example
  README.md              CSV format

src/
  data.ts        reads flows/*.csv (via import.meta.glob), else SAMPLE_FLOWS
  parseCsv.ts    CSV text -> Flow[]
  sampleData.ts  seeded generated fallback data
  ai.ts          client for the /api/ai (Gemini) endpoint
  lib.ts         date-range math, stats, rule-based summary, AI context, CSV export
  types.ts       shared types
  App.tsx        state + layout
  components/    Timeframe, StatTiles, AiSummary, ResultsTable
```

To go live later, replace `src/data.ts` with a fetch to an API that returns the
same `Flow[]` shape — nothing else changes.
