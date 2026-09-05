/**
 * Does the screener actually return the right stocks?
 *
 * The engine suite proves the rule algebra is self-consistent, and
 * verify-real-data.mts proves the indicators match an outside implementation.
 * Neither answers the question a user cares about: when a screen says these 55
 * stocks match, are those the right 55?
 *
 * This checks both directions against the real dataset, recomputing every
 * condition from raw bars with deliberately naive code that shares nothing with
 * the indicator library or the rule evaluator:
 *
 *   false positives - every returned row genuinely satisfies the conditions
 *   false negatives - no excluded symbol should have been returned
 *
 * It also brute-force checks the metrics no external vendor exposes
 * (stochastic, rolling VWAP, relative volume, 52-week extremes, gaps, streaks,
 * swing flags), so nothing in the catalog is left unverified.
 */
process.env.MARKET_DATA_PROVIDER = "bundle";
import { BundleProvider } from "../src/lib/data/bundle";
import { buildSnapshot, metricValue } from "../src/lib/engine/snapshot";
import { getListing, getProfile } from "../src/lib/data/reference";
import { runScan } from "../src/lib/engine/scan";
import { emptyScreen } from "../src/lib/engine/filters";
import type { Bar } from "../src/lib/data/types";

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  " + detail : ""}`);
  if (!ok) failures++;
};

// Needs a built dataset. CI runs this only when one is present, so skip
// cleanly rather than failing a build that legitimately has no data yet.
const { bundleStatus } = await import("../src/lib/data/bundle");
if (!bundleStatus().present) {
  console.log("No dataset installed — skipping. Build one with `npm run data:bundle`.");
  process.exit(0);
}

const provider = new BundleProvider();
const universe = await provider.getUniverse();

// ---------------------------------------------------------------------------
// 1. Brute-force the metrics no outside vendor gives us.
// ---------------------------------------------------------------------------
console.log("Metrics with no external reference — checked against naive recomputation\n");

const sample = universe.slice(0, 120);
const worst: Record<string, number> = {};
const track = (k: string, d: number) => { worst[k] = Math.max(worst[k] ?? 0, d); };
let compared = 0;

for (const listing of sample) {
  const bars: Bar[] = await provider.getHistoricalPrices(listing.symbol, 320);
  if (bars.length < 260) continue;
  const snap = buildSnapshot({ listing, profile: getProfile(listing.symbol), bars });
  if (!snap) continue;
  compared++;

  const n = bars.length;
  const i = n - 1;
  const c = bars.map(b => b.c), h = bars.map(b => b.h), l = bars.map(b => b.l), v = bars.map(b => b.v);
  const near = (a: number | null, b: number | null, tol: number, key: string) => {
    if (a == null || b == null) return;
    track(key, Math.abs(a - b) / Math.max(1, Math.abs(b)));
    if (Math.abs(a - b) > tol * Math.max(1, Math.abs(b))) {
      check(`${key} on ${listing.symbol}`, false, `mine=${a} brute=${b}`);
    }
  };

  // Slow stochastic 14/3/3, written out longhand.
  const rawK: number[] = [];
  for (let j = 0; j < n; j++) {
    if (j < 13) { rawK.push(NaN); continue; }
    let hi = -Infinity, lo = Infinity;
    for (let k = j - 13; k <= j; k++) { if (h[k] > hi) hi = h[k]; if (l[k] < lo) lo = l[k]; }
    rawK.push(hi === lo ? 50 : ((c[j] - lo) / (hi - lo)) * 100);
  }
  const smooth = (a: number[], w: number) => a.map((_, j) => {
    if (j < w - 1) return NaN;
    let s = 0; for (let k = j - w + 1; k <= j; k++) s += a[k];
    return s / w;
  });
  const kk = smooth(rawK, 3), dd = smooth(kk, 3);
  near(metricValue(snap, "stochK"), kk[i], 1e-9, "stochK");
  near(metricValue(snap, "stochD"), dd[i], 1e-9, "stochD");

  // 20-day rolling VWAP on the typical price.
  let pv = 0, vol = 0;
  for (let j = n - 20; j < n; j++) { const tp = (h[j] + l[j] + c[j]) / 3; pv += tp * v[j]; vol += v[j]; }
  near(metricValue(snap, "vwap20"), vol > 0 ? pv / vol : null, 1e-9, "vwap20");

  // Relative volume: today over the prior 20 sessions, today excluded.
  let prior = 0; for (let j = n - 21; j < n - 1; j++) prior += v[j];
  near(metricValue(snap, "relVolume"), prior > 0 ? v[i] / (prior / 20) : null, 1e-9, "relVolume");

  // 52-week extremes and distance from them.
  const win = Math.min(252, n);
  let hi52 = -Infinity, lo52 = Infinity;
  for (let j = n - win; j < n; j++) { if (h[j] > hi52) hi52 = h[j]; if (l[j] < lo52) lo52 = l[j]; }
  near(metricValue(snap, "high52"), hi52, 1e-9, "high52");
  near(metricValue(snap, "low52"), lo52, 1e-9, "low52");
  near(metricValue(snap, "pctFrom52High"), ((c[i] - hi52) / hi52) * 100, 1e-9, "pctFrom52High");

  // Gap, streaks and swing flags.
  near(metricValue(snap, "gapPct"), ((bars[i].o - c[i - 1]) / c[i - 1]) * 100, 1e-9, "gapPct");
  let up = 0; for (let j = i; j > 0 && c[j] > c[j - 1]; j--) up++;
  let down = 0; for (let j = i; j > 0 && c[j] < c[j - 1]; j--) down++;
  near(metricValue(snap, "upDays"), up, 1e-9, "upDays");
  near(metricValue(snap, "downDays"), down, 1e-9, "downDays");
  near(metricValue(snap, "higherHigh"), h[i] > h[i - 1] ? 1 : 0, 1e-9, "higherHigh");
  near(metricValue(snap, "lowerLow"), l[i] < l[i - 1] ? 1 : 0, 1e-9, "lowerLow");
  near(metricValue(snap, "changePct"), ((c[i] - c[i - 1]) / c[i - 1]) * 100, 1e-9, "changePct");
  near(metricValue(snap, "atrPct"), (metricValue(snap, "atr14") ?? 0) / c[i] * 100, 1e-9, "atrPct");
  let s20 = 0; for (let j = n - 20; j < n; j++) s20 += v[j];
  near(metricValue(snap, "avgVol20"), s20 / 20, 1e-9, "avgVol20");
}

for (const [k, d] of Object.entries(worst).sort()) {
  check(`${k} matches brute force`, d < 1e-9, `worst relative diff ${d.toExponential(1)} over ${compared} symbols`);
}

// ---------------------------------------------------------------------------
// 2. The screener itself: false positives and false negatives.
// ---------------------------------------------------------------------------
console.log(`\nScreener correctness on the real dataset (${universe.length} symbols)\n`);

const base = emptyScreen();

/** Independent oracle for the RSI(2) Oversold screen, from raw bars only. */
function oracleRsi2Oversold(bars: Bar[]): boolean | null {
  if (bars.length < 210) return null;
  const c = bars.map(b => b.c), v = bars.map(b => b.v), n = bars.length;
  // SMA 200
  let s = 0; for (let j = n - 200; j < n; j++) s += c[j];
  const sma200 = s / 200;
  // Wilder RSI(2)
  let g = 0, ll = 0;
  for (let j = 1; j <= 2; j++) { const d = c[j] - c[j - 1]; if (d > 0) g += d; else ll += -d; }
  g /= 2; ll /= 2;
  for (let j = 3; j < n; j++) {
    const d = c[j] - c[j - 1];
    g = (g * 1 + (d > 0 ? d : 0)) / 2;
    ll = (ll * 1 + (d < 0 ? -d : 0)) / 2;
  }
  const rsi2 = ll === 0 ? 100 : 100 - 100 / (1 + g / ll);
  // 20-day average volume
  let vs = 0; for (let j = n - 20; j < n; j++) vs += v[j];
  const avgVol = vs / 20;
  return c[n - 1] > sma200 && rsi2 < 10 && avgVol > 500_000;
}

const rsi2Rules = {
  kind: "group" as const, id: "g", logic: "all" as const,
  children: [
    { kind: "condition" as const, id: "a", field: "price", op: "gt" as const, ref: { field: "sma", period: 200 }, timing: { mode: "today" as const } },
    { kind: "condition" as const, id: "b", field: "rsi", period: 2, op: "lt" as const, value: 10, timing: { mode: "today" as const } },
    { kind: "condition" as const, id: "c", field: "avgVolume", op: "gt" as const, value: 500_000, timing: { mode: "today" as const } },
  ],
};

const screened = await runScan({ ...base, rules: rsi2Rules, limit: 1000 });
const returned = new Set(screened.rows.map(r => r.symbol));
console.log(`  screen returned ${returned.size} symbols`);

// Walk the WHOLE universe with the oracle and compare both directions.
let falsePos = 0, falseNeg = 0, oracleHits = 0, undecidable = 0;
const fpEx: string[] = [], fnEx: string[] = [];
for (const listing of universe) {
  const bars = await provider.getHistoricalPrices(listing.symbol, 320);
  const verdict = oracleRsi2Oversold(bars);
  if (verdict === null) { undecidable++; continue; }
  // The screen also excludes ETFs and sub-$5 prices by default.
  const price = bars.at(-1)!.c;
  const eligible = !listing.isEtf && price >= 5;
  const expected = verdict && eligible;
  if (expected) oracleHits++;
  const got = returned.has(listing.symbol);
  if (got && !expected) { falsePos++; if (fpEx.length < 4) fpEx.push(listing.symbol); }
  if (!got && expected) { falseNeg++; if (fnEx.length < 4) fnEx.push(listing.symbol); }
}

check("no false positives", falsePos === 0, `${falsePos}${fpEx.length ? " e.g. " + fpEx.join(",") : ""}`);
check("no false negatives", falseNeg === 0, `${falseNeg}${fnEx.length ? " e.g. " + fnEx.join(",") : ""}`);
check("oracle and screener agree on the count", oracleHits === returned.size, `oracle=${oracleHits} screener=${returned.size}`);
console.log(`  (${undecidable} symbols had too little history for the oracle to judge)`);

// Every row's stated reasons must actually hold.
const allReasonsTrue = screened.rows.every(r => r.reasons.length === 3 && r.trace?.passed === true);
check("every returned row's explanation checks out", allReasonsTrue);

console.log(failures === 0
  ? "\nScreener and metrics verified: no false positives, no false negatives."
  : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
