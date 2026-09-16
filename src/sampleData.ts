import type { Flow, FlowResult, ResultStatus, Severity } from "./types";

/* ------------------------------------------------------------------ *
 * Deterministic mock data.
 *
 * Everything here is generated from a seeded PRNG so the dashboard
 * shows the same numbers on every load ("Sample data — design preview").
 * Swap this module for a real API client to go live.
 * ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight (local) N days before today. */
function daysAgo(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() - n * DAY_MS);
}

function pick<T>(rng: () => number, items: T[]): T {
  return items[Math.floor(rng() * items.length)];
}

const NOTE_BANK: Record<ResultStatus, string[]> = {
  passed: [
    "Rendered within budget",
    "All assertions green",
    "Matched golden snapshot",
    "Latency 220ms",
    "No console errors",
  ],
  failed: [
    "Timed out waiting for tile",
    "Amount formatted with wrong locale",
    "Stale value after refresh",
    "500 from pricing service",
    "Layout shift over threshold",
    "Missing empty-state copy",
  ],
  ignored: [
    "Flaky — known upstream issue",
    "Muted pending JIRA fix",
    "Skipped: feature flag off",
    "Quarantined by data owner",
  ],
};

interface FlowSpec {
  id: string;
  name: string;
  source: string;
  /** Bucket shown in the flow picker — demonstrates the grouping UI even
   *  with no real /flows folder structure yet. Left undefined for one
   *  flow on purpose, to show the mixed grouped/ungrouped layout. */
  group?: string;
  categories: string[];
  /** approx results generated per day */
  perDay: number;
  /** base probability a result failed */
  failRate: number;
  /** base probability a result was ignored */
  ignoreRate: number;
  /** category that fails more often than the rest */
  hotCategory: string;
  /** history length in days */
  historyDays: number;
}

const FLOW_SPECS: FlowSpec[] = [
  {
    id: "support-tiles",
    name: "Support Tiles",
    source: "Auto-synced daily from SharePoint",
    group: "Tiles",
    categories: [
      "Renewal Tile",
      "Payment Tile",
      "Balance Tile",
      "Usage Tile",
      "Offers Tile",
    ],
    perDay: 14,
    failRate: 0.055,
    ignoreRate: 0.03,
    hotCategory: "Usage Tile",
    historyDays: 120,
  },
  {
    id: "checkout-funnel",
    name: "Checkout Funnel",
    source: "Auto-synced hourly from GitHub Actions",
    group: "Payments",
    categories: [
      "Cart",
      "Address",
      "Payment",
      "Promo Code",
      "Confirmation",
    ],
    perDay: 20,
    failRate: 0.11,
    ignoreRate: 0.02,
    hotCategory: "Promo Code",
    historyDays: 120,
  },
  {
    id: "onboarding-emails",
    name: "Onboarding Emails",
    source: "Manual upload · last import 2 days ago",
    categories: ["Welcome", "Verify", "First Value", "Nudge", "Re-engage"],
    perDay: 6,
    failRate: 0.05,
    ignoreRate: 0.06,
    hotCategory: "Re-engage",
    historyDays: 120,
  },
  {
    id: "mobile-sync",
    name: "Mobile Sync",
    source: "Auto-synced daily from SharePoint",
    group: "Mobility",
    categories: ["Login", "Pull", "Push", "Conflict", "Offline Queue"],
    perDay: 10,
    failRate: 0.14,
    ignoreRate: 0.03,
    hotCategory: "Conflict",
    historyDays: 120,
  },
];

function buildFlow(spec: FlowSpec): Flow {
  const rng = mulberry32(hashSeed(spec.id));
  const results: FlowResult[] = [];
  let counter = 1000;

  for (let d = spec.historyDays; d >= 0; d--) {
    const date = daysAgo(d);
    const iso = date.toISOString().slice(0, 10);

    // A gentle upward drift in failures over the most recent ~30 days so
    // "down X pts vs the previous period" reads as a real trend.
    const recencyBump = d < 30 ? (30 - d) / 30 * 0.03 : 0;
    // Weekends are quieter.
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    const count = Math.max(
      1,
      Math.round(spec.perDay * (weekend ? 0.4 : 1) * (0.7 + rng() * 0.6))
    );

    for (let i = 0; i < count; i++) {
      const category = pick(rng, spec.categories);
      const hot = category === spec.hotCategory;
      const failChance = spec.failRate + recencyBump + (hot ? 0.06 : 0);
      const roll = rng();

      let status: ResultStatus;
      if (roll < spec.ignoreRate) status = "ignored";
      else if (roll < spec.ignoreRate + failChance) status = "failed";
      else status = "passed";

      const severity: Severity =
        status === "failed"
          ? pick(rng, ["Medium", "High", "High", "Critical"])
          : pick(rng, ["Low", "Low", "Medium", "Medium", "High"]);

      counter += 1;
      results.push({
        id: `${spec.id.slice(0, 3).toUpperCase()}-${counter}`,
        date: iso,
        status,
        category,
        severity,
        jira:
          status === "failed" && rng() < 0.55
            ? `QA-${1200 + Math.floor(rng() * 800)}`
            : null,
        note: pick(rng, NOTE_BANK[status]),
      });
    }
  }

  // Newest first.
  results.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return {
    id: spec.id,
    name: spec.name,
    source: spec.source,
    group: spec.group,
    categories: spec.categories,
    results,
  };
}

/** Generated demo flows, used only when the /flows folder is empty. */
export const SAMPLE_FLOWS: Flow[] = FLOW_SPECS.map(buildFlow);
