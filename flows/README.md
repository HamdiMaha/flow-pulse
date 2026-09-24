# flows/

Drop Excel files in this folder (subfolders included — see "One flow = one
folder" and "Reading from SharePoint" below). The dev server / build reads
every `*.xlsx` under here and turns it into a flow on the dashboard — only
the workbook's **first sheet** is read; other sheets in the same file are
ignored. Save a file, and the page reloads with the new data. Remove all
`.xlsx` files to fall back to the built-in sample data.

## Reading from SharePoint

If your exports live in a SharePoint document library that's **synced
locally via OneDrive** (the "Sync" button in SharePoint/Teams — files show
up in File Explorer), you don't need any API or login code: just point this
app at that synced folder.

Create a subfolder here named `sharepoint` that's actually a **directory
junction** to the synced folder — no admin rights needed on Windows:

```powershell
mkdir "$env:USERPROFILE\flow-pulse\flows" -ErrorAction SilentlyContinue
mklink /J "C:\Users\<you>\flow-pulse\flows\sharepoint" "C:\Users\<you>\OneDrive - CompanyName\LibraryName\FolderName"
```

(Replace the second path with your actual synced folder — find it by
opening the library in SharePoint, clicking **Sync**, then locating it in
File Explorer under `OneDrive - <company>` in the sidebar, and copying its
address bar path.)

Restart `npm run dev` afterward. Every `.xlsx` SharePoint syncs down now
shows up as a flow automatically, on top of anything you drop directly into
`flows/`. `flows/sharepoint` is git-ignored (see `.gitignore`) since it's a
machine-specific pointer, not real content to commit.

## Test date vs. the file's own `date` column

**If a daily file is named after the day it ran** — `YYYY-MM-DD.xlsx` (e.g.
`2026-09-18.xlsx`) or `YYYYMMDD.xlsx` (e.g. `20260918.xlsx`) — that filename
is what the dashboard uses as every one of its rows' test date. The sheet's
own `date`/`run_date`/etc. column, if it has one, is **not** used for that —
it's kept and shown as a regular extra column labeled
`<original header> (original)` instead.

This exists because in real exports, that column is sometimes something
else entirely (a plan date, a pricing date) rather than when the test
actually ran — using it for Timeframe filtering would silently show the
wrong window. The filename, since you (or your export process) name it
after the actual day, is the reliable source.

A file that **isn't** named that way (e.g. a legacy single flow like
`Login Journey.xlsx`) is unaffected — its own date column is used exactly
as before.

## One flow = one folder, one file per day

**A flow is every `.xlsx` file sitting directly in the same folder, merged
together** — not one file per flow. Drop a new daily/periodic export into
that folder and it's automatically pulled into the same flow's history;
nothing new appears in the flow list, the existing flow just gets more data.
This is what makes the Timeframe picker work the way you'd expect: pick
"Today" and you see today's file's rows; pick a 3-day range and the rows
from whichever of that flow's daily files fall in that window are combined
into one view.

```
flows/sharepoint/Tiles/PT-4586/2026-09-01.xlsx
flows/sharepoint/Tiles/PT-4586/2026-09-02.xlsx
flows/sharepoint/Tiles/PT-4586/2026-09-03.xlsx
```
→ one flow, **"PT-4586"** (named after the folder), with all three days'
results merged. The sync pill shows `flows/sharepoint/Tiles/PT-4586 · 3 files
merged`.

A folder with just **one** file behaves exactly as before — that file is its
own flow, named after the file. No extra step needed for a flow that doesn't
get daily exports yet.

## Buckets (grouping flows)

The bucket shown in the picker is the folder **one level above** the flow's
folder:

```
flows/sharepoint/Tiles/PT-4586/2026-09-01.xlsx   -> flow "PT-4586", bucket "Tiles"
flows/sharepoint/Tiles/PT-5483/2026-09-01.xlsx   -> flow "PT-5483", bucket "Tiles"
flows/sharepoint/Add a Line/2026-07-24.xlsx      -> flow "Add a Line", no bucket
flows/Login Journey.xlsx                         -> flow "Login Journey", no bucket
```

("Add a Line" here has no separate bucket wrapper — its files sit directly
one level under the `sharepoint` junction, so there's nothing above it to be
a bucket. If you want it to show as a bucket too, add one more folder level,
e.g. `flows/sharepoint/Add a Line/Add a Line/2026-07-24.xlsx`.)

So if your SharePoint library already has folders per team/area, with a
subfolder per flow inside each, the folder structure becomes both the
bucket structure *and* the per-flow file-merging automatically.

**Migrating existing loose files:** if you already have multiple files
sitting directly in one bucket folder representing *different* flows (e.g.
`Tiles/PT-4586.xlsx` and `Tiles/PT-5483.xlsx` side by side), move each into
its own subfolder — `Tiles/PT-4586/PT-4586.xlsx`, `Tiles/PT-5483/PT-5483.xlsx`
— otherwise, under the rule above, they'd now merge into a single flow named
"Tiles", which is not what you want.

In the app the bucket picker shows above the flow dropdown, and the dropdown
groups flows under their bucket. With more than 6 buckets it switches from
chips to a compact dropdown so the header stays uncluttered. No buckets in
use (no subfolders) → no bucket picker at all, unchanged from before.

**Only have SharePoint access through a browser (no local sync)?** That
needs a real integration — an Azure AD app registration, Microsoft Graph
API permissions, and OAuth — which is a bigger project than this file
covers; ask if you want that built instead.

## Flow name

For a flow whose files live in their own folder (see above), the **folder
name** is the flow name. For a lone file sitting directly in `flows/` with
no folder of its own, the **file name** is the flow name:

```
Login Journey.xlsx                        ->  flow "Login Journey" (lone file)
sharepoint/Tiles/PT-4586/2026-09-01.xlsx  ->  flow "PT-4586" (folder name)
```

Either way, a sheet's own `flow`, `suite`, or `scenario` column (common in
real QA exports for something unrelated) never renames or splits the flow —
it's just kept and shown as a regular extra column.

## Columns

Header row required. Order doesn't matter. Matching ignores case, spaces,
underscores and dashes, and each column accepts several names — so
`comparaison_flag`, `match_result`, `run date` etc. are all understood without
renaming your files. Only a date column and a status column are mandatory.

| meaning  | required | accepted header names | notes |
|----------|----------|-----------------------|-------|
| date     | yes | `date`, `run_date`, `last_run`, `test_date`, `execution_date`, `executed_at`, `timestamp`, `datetime`, `created_at` | Excel date cells are read directly. As text, `2026-09-01` is preferred; `09/01/2026` (slash = US, month/day) and `15.09.2026` (dot = day.month — Canada/Europe) both parse, and mean different things for the same digits — use the separator that matches your convention. Overridden by the filename when it's dated — see above |
| status   | yes | `status`, `ststus` (typo, seen in a real export), `result`, `test_result`, `match_result`, `comparison_flag`, `comparaison_flag`, `flag`, `outcome`, `verdict`, `pass_fail` | see value list below |
| id       | no  | `id`, `test_id`, `case_id`, `test_case_id`, `tile_id`, `check_id` | auto-filled if missing |
| category | no  | `category`, `type`, `tile`, `tile_type`, `group`, `area`, `component` | grouping shown in the table and AI summary |
| severity | no  | `severity`, `priority`, `sev`, `impact` | `Low` / `Medium` / `High` / `Critical` (also `P1`–`P4`, `blocker`, `major`, `minor`) |
| jira     | no  | `jira`, `jira_key`, `jira_id`, `jira_story`, `jira_story_id`, `ticket`, `issue`, `issue_key`, `bug` | blank = no link |
| note     | no  | `note`, `notes`, `comment`, `comments`, `message`, `details`, `description`, `error_note`, `log_file` | free text, searchable |

One row = one test result. The flow name comes from the folder or file name
(see "Flow name" above), never from a column.

**The table only shows columns your file actually has.** Date and Status are
always shown (they're required). ID / Category / Severity / Jira only appear
if the sheet has a matching column — no fabricated `ROW-1` ids or
"Uncategorized" placeholders when it doesn't.

**Any column not in the list above is kept too** — it shows in the dashboard
table as an extra column under its original header, is included in search, and
is written back out by Export CSV. So a file with `environment`, `browser`,
`duration_ms`, `build` … gets one table column each, after the fixed ones.

### Status values

| becomes | recognised values |
|---------|-------------------|
| **passed**  | `passed`, `pass`, `ok`, `green`, `true`, `yes`, `y`, `1`, `match`, `matched`, `equal`, `same`, `identical` |
| **failed**  | `failed`, `fail`, `failure`, `error`, `red`, `false`, `no`, `n`, `0`, `nok`, `ko`, `mismatch`, `no match`, `not equal`, `different`, `diff` |
| **ignored** | `ignored`, `ignore`, `skip`, `skipped`, `muted`, `n/a`, `na`, `unknown`, and anything unrecognised |

## Screenshots (for the Drill-down view)

If a bucket has a drill-down configured in the dashboard (see the "Drill-down
columns for…" control at the top of that bucket's flows), clicking a result
in its detail table looks for a matching screenshot.

Drop the image in the **same folder as that day's `.xlsx` file**. Name it
after **every column value of that row**, in the sheet's own column order,
underscore-separated — e.g. a row `2026-09-01,passed,Search,Postpaid,PlanA,
Ontario` becomes:

```
2026-09-01_passed_Search_Postpaid_PlanA_Ontario.png
```

Matching ignores case, spaces, and punctuation differences, but the
**values and their order must match the row exactly** — if a value is
missing or a column's been reordered, the image silently won't be found
(no error, just no picture). `.png`, `.jpg`, and `.jpeg` are all recognized.

## Example

First sheet of the workbook:

| date | status | id | category | severity | jira | note |
|------|--------|----|----------|----------|------|------|
| 2026-09-01 | passed | LOG-1001 | Email step | Low | | clean run |
| 2026-09-01 | failed | LOG-1002 | MFA step | High | QA-1403 | timeout waiting for code |
| 2026-09-01 | ignored | LOG-1003 | SSO redirect | Medium | | known flake |

Run `node scripts/make-sample-xlsx.mjs` to (re)generate example `.xlsx`
files here to look at locally.
