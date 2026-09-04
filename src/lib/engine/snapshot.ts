import type { Bar, Listing, Profile, Sector } from "@/lib/data/types";
import {
  adx,
  atr,
  bollinger,
  consecutive,
  ema,
  macd,
  momentum,
  rollingMax,
  rollingMin,
  rollingVwap,
  rsi,
  sma,
  stochastic,
  type Series,
} from "@/lib/indicators";

/**
 * A snapshot is every indicator the screener can filter on, precomputed once
 * per symbol per session and held as short trailing arrays.
 *
 * Pure computation with no I/O, so it is deliberately not marked server-only:
 * the same code builds snapshots during a scan and can derive chart overlays in
 * the browser.
 *
 * Metric values are packed into one Float64Array per symbol rather than a
 * dictionary of JS arrays. With ~65 metrics that is 65 fewer objects and one
 * fewer level of indirection per symbol, which across the full universe is the
 * difference between a scan that fits in a small instance's heap and one that
 * does not. `NaN` stands in for "not available", so the buffer needs no
 * parallel presence mask.
 *
 * This is what makes a whole-universe scan fast (requirement 33): the heavy
 * indicator maths runs once per symbol on the server, and evaluating a
 * strategy against 6,000 snapshots is then just array lookups and comparisons.
 * Index 0 in every trailing array is today, index 1 is yesterday, and so on --
 * which is exactly the shape multi-day conditions need.
 */

/** Trailing days retained per metric. Covers "within the last N days" lookbacks. */
export const HISTORY_DAYS = 25;

/** Bars pulled per symbol: enough for SMA200 + a 52-week window + slack. */
export const LOOKBACK_BARS = 320;

/** Closes retained for on-demand custom-period indicators. */
export const CUSTOM_PERIOD_CLOSES = 280;

export const SMA_PERIODS = [5, 10, 20, 50, 100, 150, 200] as const;
export const EMA_PERIODS = [5, 10, 20, 50, 100, 200] as const;
export const RSI_PERIODS = [2, 3, 5, 7, 9, 14, 21] as const;
export const MOMENTUM_PERIODS = [1, 5, 10, 20, 50, 63, 126, 252] as const;

/**
 * Every metric `buildSnapshot` produces, in a fixed order.
 *
 * The order defines the memory layout, so entries are only ever appended --
 * never reordered or removed -- and `METRIC_INDEX` is the only way to map an id
 * to its slot.
 */
export const METRIC_IDS: string[] = [
  "close", "open", "high", "low", "volume",
  ...SMA_PERIODS.map((p) => `sma${p}`),
  ...EMA_PERIODS.map((p) => `ema${p}`),
  ...RSI_PERIODS.map((p) => `rsi${p}`),
  "macd", "macdSignal", "macdHist",
  "bbUpper", "bbMiddle", "bbLower", "bbWidth", "bbPercentB",
  "atr14", "atrPct",
  "adx14", "diPlus", "diMinus",
  "stochK", "stochD",
  "vwap20",
  ...MOMENTUM_PERIODS.map((p) => `mom${p}`),
  "changePct",
  "avgVol20", "avgVol50", "dollarVol20", "relVolume",
  "high52", "low52", "pctFrom52High", "pctFrom52Low",
  "newHigh52", "newLow52",
  "gapPct",
  "upDays", "downDays",
  "higherHigh", "higherLow", "lowerHigh", "lowerLow",
  "distSma20", "distSma50", "distSma200", "distVwap20",
];

/** Null-prototype so a crafted metric id cannot resolve to Object.prototype. */
export const METRIC_INDEX: Record<string, number> = Object.create(null);
METRIC_IDS.forEach((id, i) => (METRIC_INDEX[id] = i));

export interface SymbolSnapshot {
  symbol: string;
  name: string;
  exchange: string;
  isEtf: boolean;
  sector: Sector | null;
  industry: string | null;
  marketCap: number | null;
  beta: number | null;
  peRatio: number | null;
  eps: number | null;
  dividendYield: number | null;
  /** Bars actually available; low counts mean long-period metrics are null. */
  barCount: number;
  /** Timestamp of the most recent bar. */
  asOf: number;
  /**
   * Packed metric values: METRIC_IDS.length blocks of HISTORY_DAYS, newest
   * first within each block. NaN means "not available".
   */
  values: Float64Array;
  /**
   * Custom indicator periods the user typed in the builder (say RSI(4)),
   * computed on demand and memoised here rather than precomputed for every
   * symbol. Absent until something asks for one.
   */
  extra?: Map<string, Float64Array>;
  /**
   * Recent closes, oldest first. Retained so those custom periods can be
   * derived without going back to the provider.
   */
  closes: Float64Array;
}

/** Reverse a chronological series into "newest first", trimmed to HISTORY_DAYS. */
function trail(series: Series, days = HISTORY_DAYS): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < days; i++) {
    const idx = series.length - 1 - i;
    out.push(idx >= 0 ? series[idx] : null);
  }
  return out;
}

/** Read one packed metric value. Returns null for NaN / unknown ids. */
export function metricValue(snap: SymbolSnapshot, id: string, offset = 0): number | null {
  if (offset < 0 || offset >= HISTORY_DAYS) return null;
  const slot = METRIC_INDEX[id];
  if (slot !== undefined) {
    const v = snap.values[slot * HISTORY_DAYS + offset];
    return Number.isNaN(v) ? null : v;
  }
  const custom = snap.extra?.get(id);
  if (!custom) return null;
  const v = custom[offset];
  return Number.isNaN(v) ? null : v;
}

/** The trailing block for one metric, or null when the id is unknown. */
export function metricSeries(snap: SymbolSnapshot, id: string): Float64Array | null {
  const slot = METRIC_INDEX[id];
  if (slot !== undefined) return snap.values.subarray(slot * HISTORY_DAYS, (slot + 1) * HISTORY_DAYS);
  return snap.extra?.get(id) ?? null;
}

/** Plain-object view of every metric, for JSON responses. */
export function metricsToObject(snap: SymbolSnapshot): Record<string, (number | null)[]> {
  const out: Record<string, (number | null)[]> = {};
  for (const id of METRIC_IDS) {
    const series = metricSeries(snap, id);
    out[id] = series ? Array.from(series, (v) => (Number.isNaN(v) ? null : v)) : [];
  }
  return out;
}

const div = (a: number | null, b: number | null): number | null =>
  a == null || b == null || b === 0 ? null : a / b;

/** Percent distance of a from b (positive = a above b), element-wise. */
function distanceSeries(a: (number | null)[], b: (number | null)[]): (number | null)[] {
  return a.map((v, i) => {
    const ref = b[i];
    return v == null || ref == null || ref === 0 ? null : ((v - ref) / ref) * 100;
  });
}

export interface SnapshotInput {
  listing: Listing;
  profile: Profile;
  bars: Bar[];
  beta?: number | null;
  peRatio?: number | null;
  eps?: number | null;
  dividendYield?: number | null;
}

export function buildSnapshot(input: SnapshotInput): SymbolSnapshot | null {
  const { listing, profile, bars } = input;
  // Two bars is the floor for any change/gap metric to exist at all.
  if (bars.length < 2) return null;

  const o = bars.map((b) => b.o);
  const h = bars.map((b) => b.h);
  const l = bars.map((b) => b.l);
  const c = bars.map((b) => b.c);
  const v = bars.map((b) => b.v);

  const m: Record<string, (number | null)[]> = {};

  m.close = trail(c);
  m.open = trail(o);
  m.high = trail(h);
  m.low = trail(l);
  m.volume = trail(v);

  for (const p of SMA_PERIODS) m[`sma${p}`] = trail(sma(c, p));
  for (const p of EMA_PERIODS) m[`ema${p}`] = trail(ema(c, p));
  for (const p of RSI_PERIODS) m[`rsi${p}`] = trail(rsi(c, p));

  const macdResult = macd(c, 12, 26, 9);
  m.macd = trail(macdResult.macd);
  m.macdSignal = trail(macdResult.signal);
  m.macdHist = trail(macdResult.histogram);

  const bb = bollinger(c, 20, 2);
  m.bbUpper = trail(bb.upper);
  m.bbMiddle = trail(bb.middle);
  m.bbLower = trail(bb.lower);
  m.bbWidth = trail(bb.width);
  m.bbPercentB = trail(bb.percentB).map((x) => (x == null ? null : x * 100));

  const atr14 = atr(h, l, c, 14);
  m.atr14 = trail(atr14);
  m.atrPct = trail(atr14.map((a, i) => (a == null || c[i] === 0 ? null : (a / c[i]) * 100)));

  const adxResult = adx(h, l, c, 14);
  m.adx14 = trail(adxResult.adx);
  m.diPlus = trail(adxResult.diPlus);
  m.diMinus = trail(adxResult.diMinus);

  const stoch = stochastic(h, l, c, 14, 3, 3);
  m.stochK = trail(stoch.k);
  m.stochD = trail(stoch.d);

  m.vwap20 = trail(rollingVwap(h, l, c, v, 20));

  for (const p of MOMENTUM_PERIODS) m[`mom${p}`] = trail(momentum(c, p));
  m.changePct = m.mom1;

  const avgVol20 = sma(v, 20);
  const avgVol50 = sma(v, 50);
  m.avgVol20 = trail(avgVol20);
  m.avgVol50 = trail(avgVol50);
  m.dollarVol20 = trail(avgVol20.map((a, i) => (a == null ? null : a * c[i])));
  // Relative volume compares today's volume to the 20-day average, excluding
  // today from that average so a spike does not dilute its own signal.
  const relVol: Series = v.map((vol, i) => {
    if (i < 20) return null;
    let sum = 0;
    for (let j = i - 20; j < i; j++) sum += v[j];
    const avg = sum / 20;
    return avg > 0 ? vol / avg : null;
  });
  m.relVolume = trail(relVol);

  const high52 = rollingMax(h, 252);
  const low52 = rollingMin(l, 252);
  m.high52 = trail(high52);
  m.low52 = trail(low52);
  m.pctFrom52High = trail(
    c.map((close, i) => {
      const hi = high52[i];
      return hi == null || hi === 0 ? null : ((close - hi) / hi) * 100;
    })
  );
  m.pctFrom52Low = trail(
    c.map((close, i) => {
      const lo = low52[i];
      return lo == null || lo === 0 ? null : ((close - lo) / lo) * 100;
    })
  );

  // "New 52-week high" is a distinct question from "distance from the 52-week
  // high": the distance metric measures the close against the highest high of
  // the window (so it is essentially never positive), while a new high is set
  // when today's *high* reaches the highest high of the window.
  m.newHigh52 = trail(h.map((x, i) => (high52[i] == null ? null : x >= (high52[i] as number) ? 1 : 0)));
  m.newLow52 = trail(l.map((x, i) => (low52[i] == null ? null : x <= (low52[i] as number) ? 1 : 0)));

  // Gap: today's open against yesterday's close.
  m.gapPct = trail(
    o.map((open, i) => (i === 0 || c[i - 1] === 0 ? null : ((open - c[i - 1]) / c[i - 1]) * 100))
  );

  m.upDays = trail(consecutive(c, 1));
  m.downDays = trail(consecutive(c, -1));

  // Swing structure, judged against the prior bar.
  m.higherHigh = trail(h.map((x, i) => (i === 0 ? null : x > h[i - 1] ? 1 : 0)));
  m.higherLow = trail(l.map((x, i) => (i === 0 ? null : x > l[i - 1] ? 1 : 0)));
  m.lowerHigh = trail(h.map((x, i) => (i === 0 ? null : x < h[i - 1] ? 1 : 0)));
  m.lowerLow = trail(l.map((x, i) => (i === 0 ? null : x < l[i - 1] ? 1 : 0)));

  // Distances that the results table shows as their own columns.
  m.distSma20 = distanceSeries(m.close, m.sma20);
  m.distSma50 = distanceSeries(m.close, m.sma50);
  m.distSma200 = distanceSeries(m.close, m.sma200);
  m.distVwap20 = distanceSeries(m.close, m.vwap20);

  // Pack the metric dictionary built above into one contiguous buffer, then
  // let the dictionary go. Everything downstream reads through metricValue.
  const values = new Float64Array(METRIC_IDS.length * HISTORY_DAYS);
  values.fill(NaN);
  for (let slot = 0; slot < METRIC_IDS.length; slot++) {
    const series = m[METRIC_IDS[slot]];
    if (!series) continue;
    const base = slot * HISTORY_DAYS;
    for (let i = 0; i < HISTORY_DAYS; i++) {
      const v = series[i];
      if (v != null && Number.isFinite(v)) values[base + i] = v;
    }
  }

  const marketCap = profile.marketCap;

  return {
    symbol: listing.symbol,
    name: listing.name,
    exchange: listing.exchange,
    isEtf: listing.isEtf,
    sector: profile.sector,
    industry: profile.industry,
    marketCap,
    beta: input.beta ?? null,
    peRatio: input.peRatio ?? null,
    eps: input.eps ?? null,
    dividendYield: input.dividendYield ?? null,
    barCount: bars.length,
    asOf: bars[bars.length - 1].t,
    values,
    closes: Float64Array.from(c.slice(-CUSTOM_PERIOD_CLOSES)),
  };
}

export { div };
