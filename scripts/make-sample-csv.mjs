// Writes example CSVs into /flows so the dashboard has something to show.
// One file per flow. Run: node scripts/make-sample-csv.mjs
import { writeFileSync, mkdirSync } from "node:fs";

const FLOWS = [
  {
    name: "Login Journey",
    categories: ["Email step", "Password step", "MFA step", "SSO redirect"],
    perDay: 9,
    failRate: 0.1,
    ignoreRate: 0.03,
  },
  {
    name: "Payments Smoke",
    categories: ["Card form", "3DS challenge", "Receipt email", "Refund"],
    perDay: 7,
    failRate: 0.14,
    ignoreRate: 0.04,
  },
];

const SEVERITIES = ["Low", "Medium", "High", "Critical"];
const NOTES = {
  passed: ["clean run", "matched baseline", "under 300ms", "no errors"],
  failed: ["assertion failed", "timeout", "500 from api", "layout shift"],
  ignored: ["known flake", "muted for release", "feature flag off"],
};

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const pad = (n) => String(n).padStart(2, "0");
const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;

const outDir = new URL("../flows/", import.meta.url);
mkdirSync(outDir, { recursive: true });

const today = new Date();
today.setHours(0, 0, 0, 0);

for (const flow of FLOWS) {
  const rows = [["LAST_RUN", "MATCH_RESULT", "id", "category", "severity", "jira", "note"]];
  let counter = 1000;
  for (let d = 45; d >= 0; d--) {
    const day = new Date(today.getTime() - d * 86400000);
    const iso = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const count = Math.max(
      1,
      Math.round(flow.perDay * (weekend ? 0.4 : 1) * (0.7 + Math.random() * 0.6))
    );
    for (let i = 0; i < count; i++) {
      const roll = Math.random();
      const status =
        roll < flow.ignoreRate
          ? "ignored"
          : roll < flow.ignoreRate + flow.failRate
          ? "failed"
          : "passed";
      counter++;
      rows.push([
        iso,
        status,
        `${flow.name.slice(0, 3).toUpperCase()}-${counter}`,
        pick(flow.categories),
        status === "failed"
          ? pick(["Medium", "High", "High", "Critical"])
          : pick(SEVERITIES),
        status === "failed" && Math.random() < 0.5
          ? `QA-${1200 + Math.floor(Math.random() * 800)}`
          : "",
        pick(NOTES[status]),
      ]);
    }
  }
  const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
  writeFileSync(new URL(`${flow.name}.csv`, outDir), csv);
  console.log(`wrote flows/${flow.name}.csv (${rows.length - 1} rows)`);
}
