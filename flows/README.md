# flows/

Drop one **CSV file per flow** in this folder (subfolders included — see
"Reading from SharePoint" below). The dev server / build reads every `*.csv`
under here and turns it into a flow on the dashboard. Save a file, and the
page reloads with the new data. Remove all CSVs to fall back to the built-in
sample data.

## Reading from SharePoint

If your CSVs live in a SharePoint document library that's **synced locally
via OneDrive** (the "Sync" button in SharePoint/Teams — files show up in
File Explorer), you don't need any API or login code: just point this app
at that synced folder.

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

Restart `npm run dev` afterward. Every CSV SharePoint syncs down now shows
up as a flow automatically, on top of anything you drop directly into
`flows/`. `flows/sharepoint` is git-ignored (see `.gitignore`) since it's a
machine-specific pointer, not real content to commit.

**Only have SharePoint access through a browser (no local sync)?** That
needs a real integration — an Azure AD app registration, Microsoft Graph
API permissions, and OAuth — which is a bigger project than this file
covers; ask if you want that built instead.

## File name

The file name is the flow name shown in the dropdown:

```
Login Journey.csv   ->  "Login Journey"
Payments Smoke.csv  ->  "Payments Smoke"
```

One file always = one flow, named after the file — even if the CSV itself
has a column called `flow`, `suite`, or `scenario` (common in real QA
exports for something unrelated). That column is kept and shown as a
regular extra column; it never renames or splits the flow.

## Columns

Header row required. Order doesn't matter. Matching ignores case, spaces,
underscores and dashes, and each column accepts several names — so
`comparaison_flag`, `match_result`, `run date` etc. are all understood without
renaming your files. Only a date column and a status column are mandatory.

| meaning  | required | accepted header names | notes |
|----------|----------|-----------------------|-------|
| date     | yes | `date`, `run_date`, `last_run`, `test_date`, `execution_date`, `executed_at`, `timestamp`, `datetime`, `created_at` | `2026-09-01` preferred; `09/01/2026` and Excel dates also parse |
| status   | yes | `status`, `result`, `test_result`, `match_result`, `comparison_flag`, `comparaison_flag`, `flag`, `outcome`, `verdict`, `pass_fail` | see value list below |
| id       | no  | `id`, `test_id`, `case_id`, `test_case_id`, `tile_id`, `check_id` | auto-filled if missing |
| category | no  | `category`, `type`, `tile`, `tile_type`, `group`, `area`, `component` | grouping shown in the table and AI summary |
| severity | no  | `severity`, `priority`, `sev`, `impact` | `Low` / `Medium` / `High` / `Critical` (also `P1`–`P4`, `blocker`, `major`, `minor`) |
| jira     | no  | `jira`, `jira_key`, `jira_id`, `ticket`, `issue`, `issue_key`, `bug` | blank = no link |
| note     | no  | `note`, `notes`, `comment`, `comments`, `message`, `details`, `description` | free text, searchable |

One row = one test result. The flow name always comes from the **file name**,
never from a column — see above.

**The table only shows columns your file actually has.** Date and Status are
always shown (they're required). ID / Category / Severity / Jira only appear
if the file has a matching column — no fabricated `ROW-1` ids or
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

## Example

```csv
date,status,id,category,severity,jira,note
2026-09-01,passed,LOG-1001,Email step,Low,,clean run
2026-09-01,failed,LOG-1002,MFA step,High,QA-1403,timeout waiting for code
2026-09-01,ignored,LOG-1003,SSO redirect,Medium,,known flake
```

The two `.csv` files already here are generated examples — overwrite or delete
them. Regenerate with `node scripts/make-sample-csv.mjs`.
