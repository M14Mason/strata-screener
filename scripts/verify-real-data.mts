/**
 * Cross-checks the indicator library against an independent vendor's numbers,
 * over real market data.
 *
 * The other suites prove the code is self-consistent. This one proves it agrees
 * with somebody else's implementation on real AAPL bars, which is the only way
 * to catch a formula that is coded correctly but defined wrongly.
 *
 * Fixture: 317 split-adjusted AAPL daily bars captured 2026-09-04, together
 * with the same vendor's RSI / MACD / Bollinger output for the closing bars.
 * Both are frozen, so this test is deterministic and needs no network.
 */
import fixture from "../src/data/fixtures/aapl-daily.json";
import { adx, atr, bollinger, ema, macd, momentum, rsi, sma } from "../src/lib/indicators";

type Row = [string, number, number, number, number, number];
const rows = fixture.rows as Row[];
const dates = rows.map((r) => r[0]);
const close = rows.map((r) => r[4]);
const at = new Map(dates.map((d, i) => [d, i]));

let failures = 0;
const check = (label: string, mine: number | null | undefined, vendor: number, tol: number) => {
  const ok = mine != null && Number.isFinite(mine) && Math.abs(mine - vendor) <= tol;
  const delta = mine != null ? Math.abs(mine - vendor).toExponential(1) : "n/a";
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(28)} mine=${mine?.toFixed(6) ?? "null"} vendor=${vendor.toFixed(6)} Δ=${delta}`);
  if (!ok) failures++;
};

console.log(`Real AAPL daily bars: ${rows.length}, ${dates[0]} .. ${dates.at(-1)}\n`);

// --- RSI(14): Wilder smoothing -------------------------------------------
const r14 = rsi(close, 14);
for (const [d, v] of [
  ["2026-08-27", 52.55178111286991],
  ["2026-08-28", 57.366091612779634],
  ["2026-08-31", 54.076925859780424],
  ["2026-09-01", 61.06204470852713],
  ["2026-09-02", 60.857372294592835],
  ["2026-09-03", 63.38419994010551],
] as Array<[string, number]>) {
  check(`RSI(14) ${d}`, r14[at.get(d)!], v, 1e-6);
}

// --- MACD 12/26/9 ---------------------------------------------------------
console.log("");
const m = macd(close, 12, 26, 9);
for (const [d, line, signal, hist] of [
  ["2026-09-01", 1.2090814293650851, -0.3022664536241784, 1.5113478829892635],
  ["2026-09-02", 1.8962184674562081, 0.13743053059189891, 1.7587879368643091],
  ["2026-09-03", 2.67222362872468, 0.6443891502184552, 2.027834478506225],
] as Array<[string, number, number, number]>) {
  const i = at.get(d)!;
  check(`MACD line ${d}`, m.macd[i], line, 1e-6);
  check(`MACD signal ${d}`, m.signal[i], signal, 1e-4);
  check(`MACD hist ${d}`, m.histogram[i], hist, 1e-4);
}

// --- Bollinger: a genuine definitional difference, not a defect -----------
//
// The vendor centres its bands on an EMA. Bollinger's own definition -- and the
// default in Finviz, StockCharts and TradingView -- centres on an SMA, which is
// what this library implements. Two things must therefore hold: the standard
// deviation term has to agree exactly (so the band *width* matches), and
// re-centring on an EMA has to reproduce the vendor's numbers exactly. Together
// those pin down that the only difference is the choice of centre.
console.log("");
const bb = bollinger(close, 20, 2);
const e20 = ema(close, 20);
for (const [d, lower, middle, upper] of [
  ["2026-09-02", 303.0480965786236, 315.36416023548213, 327.6802238923407],
  ["2026-09-03", 302.3891770172112, 316.58757354638857, 330.78597007556596],
] as Array<[string, number, number, number]>) {
  const i = at.get(d)!;
  check(`BB width ${d}`, bb.upper[i]! - bb.lower[i]!, upper - lower, 1e-6);
  check(`BB middle as EMA ${d}`, e20[i], middle, 1e-6);
  // And the SMA centre is what we actually ship.
  check(`BB middle as SMA ${d}`, bb.middle[i], sma(close, 20)[i]!, 1e-9);
}

// --- RSI(2): the app's headline indicator ---------------------------------
console.log("");
const r2 = rsi(close, 2);
for (const [d, v] of [
  ["2026-08-28", 97.0424178370572],
  ["2026-08-31", 53.18218818250703],
  ["2026-09-01", 87.08895027342085],
  ["2026-09-02", 84.57382421770374],
  ["2026-09-03", 92.66898291832227],
] as Array<[string, number]>) {
  check(`RSI(2) ${d}`, r2[at.get(d)!], v, 1e-9);
}

// --- ATR(14), ADX(14), SMA(200), ROC(20) ----------------------------------
console.log("");
const high = rows.map((r) => r[2]);
const low = rows.map((r) => r[3]);
const a14 = atr(high, low, close, 14);
for (const [d, v] of [
  ["2026-09-01", 7.625113694225825],
  ["2026-09-02", 7.42831985892398],
  ["2026-09-03", 7.3762970118579805],
] as Array<[string, number]>) check(`ATR(14) ${d}`, a14[at.get(d)!], v, 1e-6);

const ax = adx(high, low, close, 14);
for (const [d, v] of [
  ["2026-09-01", 13.823829357584469],
  ["2026-09-02", 14.399631063679108],
  ["2026-09-03", 15.224185640131365],
] as Array<[string, number]>) check(`ADX(14) ${d}`, ax.adx[at.get(d)!], v, 1e-6);

const s200 = sma(close, 200);
for (const [d, v] of [
  ["2026-09-01", 283.06845],
  ["2026-09-02", 283.3285],
  ["2026-09-03", 283.6075],
] as Array<[string, number]>) check(`SMA(200) ${d}`, s200[at.get(d)!], v, 1e-9);

const m20 = momentum(close, 20);
for (const [d, v] of [
  ["2026-09-01", 5.0908268149201685],
  ["2026-09-02", 4.488745980707387],
  ["2026-09-03", 5.057456547485661],
] as Array<[string, number]>) check(`Momentum(20) ${d}`, m20[at.get(d)!], v, 1e-9);

// --- EMA: a warm-up difference, not an arithmetic one ---------------------
//
// Recursive indicators never fully forget their seed, so a series computed from
// a slightly different start date converges but never matches exactly. The
// residuals against the vendor are ordered precisely by each indicator's decay
// rate: RSI(2) (alpha 1/2) matches exactly, Wilder-14 lands near 1e-10, and
// EMA(50) (alpha 2/51, the slowest) is largest at ~6e-5. Asserting the bound
// rather than equality records that, and would still catch a real defect --
// anything structurally wrong would be orders of magnitude larger.
console.log("");
const e50 = ema(close, 50);
for (const [d, v] of [
  ["2026-09-01", 311.01586387032654],
  ["2026-09-02", 311.5626927381569],
  ["2026-09-03", 312.2155283170527],
] as Array<[string, number]>) {
  check(`EMA(50) ${d} within warm-up tolerance`, e50[at.get(d)!], v, 5e-4);
}

// --- SMA against a hand-rolled mean ---------------------------------------
console.log("");
const last = close.length - 1;
const manual50 = close.slice(-50).reduce((a, b) => a + b, 0) / 50;
check("SMA(50) vs manual mean", sma(close, 50)[last], manual50, 1e-9);

console.log(
  failures === 0
    ? "\nEvery indicator agrees with the independent computation on real market data."
    : `\n${failures} mismatch(es)`
);
process.exit(failures === 0 ? 0 : 1);
