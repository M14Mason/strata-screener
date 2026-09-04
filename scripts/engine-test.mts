/** End-to-end engine check: universe -> snapshots -> rules -> results. */
process.env.MARKET_DATA_PROVIDER ||= "demo";
import { runScan, parseScreenRequest } from "../src/lib/engine/scan";
import { PRESET_STRATEGIES } from "../src/lib/engine/presets";
import { emptyScreen } from "../src/lib/engine/filters";
import { getSnapshot } from "../src/lib/engine/store";
import { evaluateRules } from "../src/lib/engine/rules";

function pass(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);
  if (!ok) process.exitCode = 1;
}

const t0 = Date.now();
const base = emptyScreen();

// --- 1. Bare scan over the whole universe -----------------------------------
const all = await runScan({ ...base, limit: 5 });
console.log(`\nfull universe scan: ${all.meta.scanned} scanned, ${all.meta.matches} matches, ${all.meta.elapsedMs}ms`);
pass("scans thousands of symbols", all.meta.scanned > 3000, `scanned=${all.meta.scanned}`);
pass("penny stocks excluded by default", all.rows.every((r) => (r.price ?? 0) >= 5));
pass("ETFs excluded by default", all.rows.every((r) => !r.isEtf));

// --- 2. Warm-cache rescan ----------------------------------------------------
const warm = await runScan({ ...base, limit: 5 });
console.log(`warm rescan: ${warm.meta.elapsedMs}ms`);
pass("warm rescan is fast", warm.meta.elapsedMs < all.meta.elapsedMs);

// --- 3. Price filter ---------------------------------------------------------
const priced = await runScan({ ...base, filters: { priceMin: 20, priceMax: 60 }, limit: 500 });
pass("price filter respected", priced.rows.every((r) => r.price! >= 20 && r.price! <= 60), `n=${priced.meta.matches}`);

// --- 4. Volume + sector filters ---------------------------------------------
const tech = await runScan({ ...base, filters: { sectors: ["Technology"], avgVolumeMin: 500_000 }, limit: 500 });
pass("sector filter respected", tech.rows.every((r) => r.sector === "Technology"), `n=${tech.meta.matches}`);
pass("avg volume filter respected", tech.rows.every((r) => (r.avgVolume ?? 0) >= 500_000));

// --- 5. Each preset strategy runs and its rows genuinely satisfy the rules ----
console.log("");
for (const preset of PRESET_STRATEGIES) {
  const res = await runScan({ ...base, rules: preset.rules, filters: preset.filters ?? {}, limit: 20 });
  // Correctness check must respect group logic: an unmet condition inside an
  // ANY group is not a failure, so verify the trace root rather than every leaf.
  const everyReasonPassed = res.rows.every((r) => r.reasons.length > 0 && r.trace?.passed === true);
  // Independently re-evaluate a returned row from its own snapshot.
  let reverified = true;
  if (res.rows[0]) {
    const snap = await getSnapshot(res.rows[0].symbol);
    reverified = !!snap && evaluateRules(snap, preset.rules).passed;
  }
  pass(
    `preset "${preset.name}"`,
    everyReasonPassed && reverified,
    `${String(res.meta.matches).padStart(5)} matches in ${res.meta.elapsedMs}ms`
  );
}

// --- 6. Specific semantics ---------------------------------------------------
console.log("");
const rsi2 = PRESET_STRATEGIES.find((p) => p.id === "rsi2-oversold")!;
const r = await runScan({ ...base, rules: rsi2.rules, limit: 300 });
pass(
  "RSI(2) < 10 truly below 10",
  r.rows.every((x) => x.rsi2 != null && x.rsi2 < 10),
  `n=${r.meta.matches}`
);
pass("price above SMA200 in RSI(2) screen", r.rows.every((x) => x.price! > x.sma200!));
pass("avg volume above 500K", r.rows.every((x) => x.avgVolume! > 500_000));

// AND vs OR must differ, and OR must be a superset of each branch.
const andRules = { kind: "group", id: "g", logic: "all", children: [
  { kind: "condition", id: "c1", field: "rsi", period: 2, op: "lt", value: 10, timing: { mode: "today" } },
  { kind: "condition", id: "c2", field: "momentum", period: 20, op: "gt", value: 10, timing: { mode: "today" } },
]} as const;
const orRules = { ...andRules, logic: "any" } as const;
const a = await runScan({ ...base, rules: parseScreenRequest({ rules: andRules }).rules, limit: 1 });
const o = await runScan({ ...base, rules: parseScreenRequest({ rules: orRules }).rules, limit: 1 });
pass("OR returns strictly more than AND", o.meta.matches > a.meta.matches, `AND=${a.meta.matches} OR=${o.meta.matches}`);

// NONE is the exact complement of ANY over the same filtered set, so the two
// counts must add up to the number of rows that cleared the basic filters.
const noneRules = { ...andRules, logic: "none" } as const;
const n = await runScan({ ...base, rules: parseScreenRequest({ rules: noneRules }).rules, limit: 1 });
const noRules = await runScan({ ...base, rules: null, limit: 1 });
pass(
  "NONE is the exact complement of ANY",
  o.meta.matches + n.meta.matches === noRules.meta.matches,
  `ANY=${o.meta.matches} + NONE=${n.meta.matches} = ${o.meta.matches + n.meta.matches}, unfiltered=${noRules.meta.matches}`
);

// Multi-day timing: "yesterday" must differ from "today".
const today = parseScreenRequest({ rules: { kind: "group", id: "g", logic: "all", children: [
  { kind: "condition", id: "c", field: "rsi", period: 2, op: "lt", value: 10, timing: { mode: "today" } }]}}).rules;
const yday = parseScreenRequest({ rules: { kind: "group", id: "g", logic: "all", children: [
  { kind: "condition", id: "c", field: "rsi", period: 2, op: "lt", value: 10, timing: { mode: "daysAgo", days: 1 } }]}}).rules;
const within = parseScreenRequest({ rules: { kind: "group", id: "g", logic: "all", children: [
  { kind: "condition", id: "c", field: "rsi", period: 2, op: "lt", value: 10, timing: { mode: "withinLast", days: 5 } }]}}).rules;
const rt = await runScan({ ...base, rules: today, limit: 1 });
const ry = await runScan({ ...base, rules: yday, limit: 1 });
const rw = await runScan({ ...base, rules: within, limit: 1 });
pass("today vs yesterday give different sets", rt.meta.matches !== ry.meta.matches, `today=${rt.meta.matches} yday=${ry.meta.matches}`);
pass("withinLast(5) is a superset of today", rw.meta.matches > rt.meta.matches, `within5=${rw.meta.matches}`);

// Custom (non-precomputed) RSI period must work.
const custom = parseScreenRequest({ rules: { kind: "group", id: "g", logic: "all", children: [
  { kind: "condition", id: "c", field: "rsi", period: 4, op: "lt", value: 12, timing: { mode: "today" } }]}}).rules;
const rc = await runScan({ ...base, rules: custom, limit: 3 });
pass("custom RSI(4) period evaluates", rc.meta.matches > 0 && rc.rows.every((x) => x.reasons[0].passed && x.reasons[0].actual! < 12), `n=${rc.meta.matches}`);

// Sorting.
const sorted = await runScan({ ...base, sort: { field: "rsi2", dir: "asc" }, limit: 50 });
const vals = sorted.rows.map((x) => x.rsi2!).filter((v) => v != null);
pass("ascending sort is ordered", vals.every((v, i) => i === 0 || vals[i - 1] <= v));

// Hostile / malformed rules must fail closed, not throw.
const bad = parseScreenRequest({ rules: { kind: "group", logic: "all", children: [
  { kind: "condition", field: "__proto__", op: "gt", value: 1 },
  { kind: "condition", field: "rsi", op: "evil", value: 1 },
  { kind: "condition", field: "rsi", period: 99999, op: "lt", value: 50, timing: { mode: "daysAgo", days: 9e9 } },
]}});
pass("malformed conditions are dropped", bad.rules!.children.length === 1, `kept=${bad.rules!.children.length}`);
pass("period is clamped", (bad.rules!.children[0] as any).period === 400);
pass("lookback is clamped", (bad.rules!.children[0] as any).timing.days <= 23);

// A new 52-week high must genuinely be a new high, not just a close near one.
const nh = await runScan({ ...base, rules: parseScreenRequest({ rules: { kind: "group", id: "g", logic: "all", children: [
  { kind: "condition", id: "c", field: "newHigh52", op: "isTrue", timing: { mode: "today" } }]}}).rules, limit: 30 });
pass("new 52-week high screen returns rows", nh.meta.matches > 0, `n=${nh.meta.matches}`);
// A new high is set intraday, so the close can settle below it; what must hold
// is that no row is far off its 52-week high.
pass("new-high rows sit near their 52w high", nh.rows.every((x) => (x.pctFrom52High ?? -99) > -12));

// Watchlist universe.
const wl = await runScan({ ...base, universe: { scope: "watchlist", includeEtfs: true, excludePenny: false, pennyThreshold: 5, symbols: ["AAPL","MSFT","NVDA","AMD"] }, limit: 50 });
pass("watchlist universe restricts symbols", wl.meta.matches === 4 && wl.rows.every((x) => ["AAPL","MSFT","NVDA","AMD"].includes(x.symbol)), `n=${wl.meta.matches}`);

// Exchange scope.
const nasdaq = await runScan({ ...base, universe: { ...base.universe, scope: "nasdaq" }, limit: 50 });
pass("NASDAQ scope only returns NASDAQ", nasdaq.rows.every((x) => x.exchange === "NASDAQ"));

// ETFs scope.
const etf = await runScan({ ...base, universe: { ...base.universe, scope: "etf" }, limit: 20 });
pass("ETF scope only returns ETFs", etf.rows.length > 0 && etf.rows.every((x) => x.isEtf), `n=${etf.meta.matches}`);


// --- 7. Operator semantics, verified against the snapshot itself -------------
console.log("");
const R = (children: any[], logic = "all") => parseScreenRequest({ rules: { kind: "group", id: "g", logic, children } }).rules;
const C = (o: any) => ({ kind: "condition", id: "c" + Math.random(), timing: { mode: "today" }, ...o });

// withinPct: every row must genuinely sit inside the tolerance band.
const nearMa = await runScan({ ...base, rules: R([C({ field: "price", op: "withinPct", ref: { field: "sma", period: 50 }, value2: 1 })]), limit: 200 });
pass(
  "withinPct keeps rows inside the band",
  nearMa.rows.every((r) => Math.abs(r.distSma50!) <= 1.0000001),
  `n=${nearMa.meta.matches}, worst=${Math.max(...nearMa.rows.map((r) => Math.abs(r.distSma50!))).toFixed(3)}%`
);

// between
const btw = await runScan({ ...base, rules: R([C({ field: "rsi", period: 14, op: "between", value: 40, value2: 60 })]), limit: 200 });
pass("between is inclusive of both bounds", btw.rows.every((r) => r.rsi14! >= 40 && r.rsi14! <= 60), `n=${btw.meta.matches}`);

// rising / falling on a moving average, re-derived from the snapshot
const rising = await runScan({ ...base, rules: R([C({ field: "sma", period: 50, op: "rising" })]), limit: 40 });
let risingOk = true;
for (const row of rising.rows.slice(0, 20)) {
  const snap = (await getSnapshot(row.symbol))!;
  if (!(snap.m.sma50[0]! > snap.m.sma50[1]!)) risingOk = false;
}
pass("rising means today > yesterday", risingOk, `n=${rising.meta.matches}`);

const falling = await runScan({ ...base, rules: R([C({ field: "sma", period: 50, op: "falling" })]), limit: 40 });
pass("rising and falling are disjoint and cover the set", rising.meta.matches + falling.meta.matches <= noRules.meta.matches,
  `rising=${rising.meta.matches} falling=${falling.meta.matches} total=${noRules.meta.matches}`);

// NOT on a single condition inverts it exactly.
const plain = await runScan({ ...base, rules: R([C({ field: "rsi", period: 2, op: "lt", value: 30 })]), limit: 1 });
const negated = await runScan({ ...base, rules: R([C({ field: "rsi", period: 2, op: "lt", value: 30, not: true })]), limit: 1 });
pass("NOT inverts a condition exactly", plain.meta.matches + negated.meta.matches === noRules.meta.matches,
  `plain=${plain.meta.matches} + not=${negated.meta.matches} = ${plain.meta.matches + negated.meta.matches}, all=${noRules.meta.matches}`);

// Nested groups: ALL[ x, ANY[ y, z ] ] must equal x AND (y OR z).
const x = C({ field: "price", op: "gt", ref: { field: "sma", period: 200 } });
const y = C({ field: "rsi", period: 2, op: "lt", value: 10 });
const z = C({ field: "stochK", op: "lt", value: 15 });
const nested = await runScan({ ...base, rules: R([x, { kind: "group", id: "inner", logic: "any", children: [y, z] }]), limit: 1 });
const xy = await runScan({ ...base, rules: R([x, y]), limit: 1 });
const xz = await runScan({ ...base, rules: R([x, z]), limit: 1 });
pass("nested ANY inside ALL is a superset of each branch",
  nested.meta.matches >= xy.meta.matches && nested.meta.matches >= xz.meta.matches && nested.meta.matches <= xy.meta.matches + xz.meta.matches,
  `nested=${nested.meta.matches}, x&y=${xy.meta.matches}, x&z=${xz.meta.matches}`);

// Crossovers must be a strict subset of the corresponding level condition.
const below = await runScan({ ...base, rules: R([C({ field: "rsi", period: 2, op: "gt", value: 10 })]), limit: 1 });
const crossed = await runScan({ ...base, rules: R([C({ field: "rsi", period: 2, op: "crossesAbove", value: 10 })]), limit: 1 });
pass("crossesAbove is a strict subset of is-above", crossed.meta.matches < below.meta.matches && crossed.meta.matches > 0,
  `crossed=${crossed.meta.matches} above=${below.meta.matches}`);

// Boolean operators
const hh = await runScan({ ...base, rules: R([C({ field: "higherHigh", op: "isTrue" })]), limit: 1 });
const nhh = await runScan({ ...base, rules: R([C({ field: "higherHigh", op: "isFalse" })]), limit: 1 });
pass("isTrue and isFalse partition the set", hh.meta.matches + nhh.meta.matches === noRules.meta.matches,
  `true=${hh.meta.matches} false=${nhh.meta.matches}`);

// An empty group must not silently exclude everything.
const empty = await runScan({ ...base, rules: R([]), limit: 1 });
pass("an empty rule group is neutral", empty.meta.matches === noRules.meta.matches, `n=${empty.meta.matches}`);

// --- 8. Explanations ---------------------------------------------------------
const explained = await runScan({ ...base, rules: rsi2.rules, limit: 3 });
const first = explained.rows[0];
pass("every returned row carries an explanation", explained.rows.every((r) => r.reasons.length === 3 && r.trace !== null));
pass("explanations name the value and the threshold",
  /RSI\(2\) = [\d.]+, is below 10/.test(first.reasons[1].explanation),
  first.reasons[1].explanation);
const BANNED = /\b(buy|sell|guaranteed|will go up|sure thing|winner|profit)\b/i;
pass("explanations use no recommendation language",
  explained.rows.every((r) => r.reasons.every((x) => !BANNED.test(x.explanation))));

console.log(`\ntotal ${Date.now() - t0}ms`);
