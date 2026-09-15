# flows/

Drop one **CSV file per flow** in this folder. The dev server / build reads
every `*.csv` here and turns it into a flow on the dashboard. Save a file,
and the page reloads with the new data. Remove all CSVs to fall back to the
built-in sample data.

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

**Any column not in the list above is kept too** — it shows in the dashboard
table as an extra column under its original header, is included in search, and
is written back out by Export CSV. So a file with `environment`, `browser`,
`duration_ms`, `build` … gets one table column each, after Jira.

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
