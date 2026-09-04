/**
 * Pure technical-indicator math.
 *
 * Every function takes plain number arrays in chronological order (oldest
 * first) and returns an array of the same length, with `null` for leading
 * positions where the indicator is not yet defined. Keeping the shape aligned
 * with the input means the screener, the strategy builder and the chart can
 * all index into results by bar without re-deriving offsets.
 *
 * Nothing here touches I/O, React or the network, so it is equally usable on
 * the server (bulk scanning) and in the browser (chart overlays).
 */

export type Series = (number | null)[];

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Simple moving average. */
export function sma(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Exponential moving average, seeded with the SMA of the first `period` bars. */
export function ema(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let prev = seed / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's smoothing (used by RSI / ATR / ADX). */
function wilder(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = (prev * (period - 1) + values[i]) / period;
    out[i] = prev;
  }
  return out;
}

/**
 * Relative Strength Index using Wilder's smoothing -- the standard definition,
 * and the one that makes RSI(2) behave the way short-term mean-reversion
 * screens expect.
 */
export function rsi(closes: number[], period: number): Series {
  const n = closes.length;
  const out: Series = new Array(n).fill(null);
  if (period <= 0 || n <= period) return out;

  const gains: number[] = new Array(n - 1);
  const losses: number[] = new Array(n - 1);
  for (let i = 1; i < n; i++) {
    const d = closes[i] - closes[i - 1];
    gains[i - 1] = d > 0 ? d : 0;
    losses[i - 1] = d < 0 ? -d : 0;
  }

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    avgGain += gains[i];
    avgLoss += losses[i];
  }
  avgGain /= period;
  avgLoss /= period;

  const rsiAt = (g: number, l: number) => (l === 0 ? 100 : 100 - 100 / (1 + g / l));
  out[period] = rsiAt(avgGain, avgLoss);

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    out[i + 1] = rsiAt(avgGain, avgLoss);
  }
  return out;
}

export interface MacdResult {
  macd: Series;
  signal: Series;
  histogram: Series;
}

export function macd(closes: number[], fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  const fastLine = ema(closes, fast);
  const slowLine = ema(closes, slow);
  const line: Series = closes.map((_, i) =>
    isNum(fastLine[i]) && isNum(slowLine[i]) ? (fastLine[i] as number) - (slowLine[i] as number) : null
  );

  // The signal line is an EMA of the MACD line, so it must be seeded from the
  // first bar where the MACD line exists rather than from bar 0.
  const firstIdx = line.findIndex(isNum);
  const signal: Series = new Array(closes.length).fill(null);
  const histogram: Series = new Array(closes.length).fill(null);
  if (firstIdx >= 0) {
    const compact = line.slice(firstIdx).map((v) => v as number);
    const sig = ema(compact, signalPeriod);
    for (let i = 0; i < sig.length; i++) {
      const idx = firstIdx + i;
      signal[idx] = sig[i];
      if (isNum(sig[i]) && isNum(line[idx])) histogram[idx] = (line[idx] as number) - (sig[i] as number);
    }
  }
  return { macd: line, signal, histogram };
}

export interface BollingerResult {
  upper: Series;
  middle: Series;
  lower: Series;
  /** (upper - lower) / middle, expressed in percent. */
  width: Series;
  /** Where price sits inside the bands: 0 = lower band, 1 = upper band. */
  percentB: Series;
}

/**
 * Bollinger Bands, centred on a *simple* moving average.
 *
 * Some vendors centre the bands on an EMA instead. Bollinger's own definition
 * uses an SMA, as do Finviz, StockCharts and TradingView by default, so that is
 * what this returns. `scripts/verify-real-data.mts` pins the distinction down
 * against real bars: the standard-deviation term matches an EMA-centred vendor
 * exactly (identical band width), and re-centring on EMA(period) reproduces
 * their middle band to 1e-13.
 */
export function bollinger(closes: number[], period = 20, mult = 2): BollingerResult {
  const n = closes.length;
  const middle = sma(closes, period);
  const upper: Series = new Array(n).fill(null);
  const lower: Series = new Array(n).fill(null);
  const width: Series = new Array(n).fill(null);
  const percentB: Series = new Array(n).fill(null);

  for (let i = period - 1; i < n; i++) {
    const mean = middle[i];
    if (!isNum(mean)) continue;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (closes[j] - mean) ** 2;
    const sd = Math.sqrt(variance / period);
    const up = mean + mult * sd;
    const low = mean - mult * sd;
    upper[i] = up;
    lower[i] = low;
    width[i] = mean !== 0 ? ((up - low) / mean) * 100 : null;
    percentB[i] = up !== low ? (closes[i] - low) / (up - low) : 0.5;
  }
  return { upper, middle, lower, width, percentB };
}

/** True range for each bar (bar 0 falls back to high - low). */
export function trueRange(high: number[], low: number[], close: number[]): number[] {
  const out = new Array(high.length).fill(0);
  out[0] = high[0] - low[0];
  for (let i = 1; i < high.length; i++) {
    out[i] = Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1]));
  }
  return out;
}

export function atr(high: number[], low: number[], close: number[], period = 14): Series {
  return wilder(trueRange(high, low, close), period);
}

export interface AdxResult {
  adx: Series;
  diPlus: Series;
  diMinus: Series;
}

export function adx(high: number[], low: number[], close: number[], period = 14): AdxResult {
  const n = high.length;
  const empty = (): Series => new Array(n).fill(null);
  if (n < period * 2) return { adx: empty(), diPlus: empty(), diMinus: empty() };

  const tr = trueRange(high, low, close);
  const plusDM = new Array(n).fill(0);
  const minusDM = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const up = high[i] - high[i - 1];
    const down = low[i - 1] - low[i];
    plusDM[i] = up > down && up > 0 ? up : 0;
    minusDM[i] = down > up && down > 0 ? down : 0;
  }

  const trS = wilder(tr, period);
  const plusS = wilder(plusDM, period);
  const minusS = wilder(minusDM, period);

  const diPlus = empty();
  const diMinus = empty();
  const dx: number[] = [];
  const dxIndex: number[] = [];

  for (let i = 0; i < n; i++) {
    const t = trS[i];
    if (!isNum(t) || t === 0 || !isNum(plusS[i]) || !isNum(minusS[i])) continue;
    const dp = (100 * (plusS[i] as number)) / t;
    const dm = (100 * (minusS[i] as number)) / t;
    diPlus[i] = dp;
    diMinus[i] = dm;
    const sum = dp + dm;
    dx.push(sum === 0 ? 0 : (100 * Math.abs(dp - dm)) / sum);
    dxIndex.push(i);
  }

  const adxOut = empty();
  const smoothed = wilder(dx, period);
  for (let i = 0; i < smoothed.length; i++) if (isNum(smoothed[i])) adxOut[dxIndex[i]] = smoothed[i];
  return { adx: adxOut, diPlus, diMinus };
}

export interface StochasticResult {
  k: Series;
  d: Series;
}

/** Slow stochastic: raw %K smoothed by `smoothK`, %D = SMA(%K, dPeriod). */
export function stochastic(
  high: number[],
  low: number[],
  close: number[],
  kPeriod = 14,
  smoothK = 3,
  dPeriod = 3
): StochasticResult {
  const n = close.length;
  const raw: Series = new Array(n).fill(null);
  for (let i = kPeriod - 1; i < n; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (high[j] > hh) hh = high[j];
      if (low[j] < ll) ll = low[j];
    }
    raw[i] = hh === ll ? 50 : ((close[i] - ll) / (hh - ll)) * 100;
  }
  const k = smoothSeries(raw, smoothK);
  const d = smoothSeries(k, dPeriod);
  return { k, d };
}

/** SMA over a series that may contain leading nulls, preserving alignment. */
export function smoothSeries(series: Series, period: number): Series {
  const out: Series = new Array(series.length).fill(null);
  if (period <= 1) return series.slice();
  const first = series.findIndex(isNum);
  if (first < 0) return out;
  const compact = series.slice(first).map((v) => (isNum(v) ? v : 0));
  const s = sma(compact, period);
  for (let i = 0; i < s.length; i++) out[first + i] = s[i];
  return out;
}

/**
 * Rolling VWAP over `period` daily bars using the typical price.
 *
 * True VWAP is an intraday, session-anchored measure. With daily bars the
 * honest equivalent is a volume-weighted average of recent sessions, which is
 * what this returns -- the UI labels it as a rolling VWAP so the distinction
 * is never hidden.
 */
export function rollingVwap(
  high: number[],
  low: number[],
  close: number[],
  volume: number[],
  period = 20
): Series {
  const n = close.length;
  const out: Series = new Array(n).fill(null);
  let pv = 0;
  let vol = 0;
  const tp = (i: number) => (high[i] + low[i] + close[i]) / 3;
  for (let i = 0; i < n; i++) {
    pv += tp(i) * volume[i];
    vol += volume[i];
    if (i >= period) {
      pv -= tp(i - period) * volume[i - period];
      vol -= volume[i - period];
    }
    if (i >= period - 1) out[i] = vol > 0 ? pv / vol : null;
  }
  return out;
}

/** Percent change over `period` bars -- i.e. momentum / rate of change. */
export function momentum(closes: number[], period: number): Series {
  const out: Series = new Array(closes.length).fill(null);
  for (let i = period; i < closes.length; i++) {
    const base = closes[i - period];
    if (base > 0) out[i] = ((closes[i] - base) / base) * 100;
  }
  return out;
}

/**
 * Highest value over a trailing window, inclusive of the current bar.
 *
 * Uses a monotonic deque so a 252-bar (52-week) window over the whole universe
 * stays O(n) rather than O(n * period). Partial windows are allowed from bar 1
 * so recently listed names still get a 52-week reading instead of nothing.
 */
export function rollingMax(values: number[], period: number): Series {
  return rollingExtreme(values, period, true);
}

/** Lowest value over a trailing window, inclusive of the current bar. */
export function rollingMin(values: number[], period: number): Series {
  return rollingExtreme(values, period, false);
}

function rollingExtreme(values: number[], period: number, wantMax: boolean): Series {
  const n = values.length;
  const out: Series = new Array(n).fill(null);
  const deque: number[] = []; // indices, values monotonic from the front
  for (let i = 0; i < n; i++) {
    while (deque.length && deque[0] <= i - period) deque.shift();
    while (deque.length) {
      const last = values[deque[deque.length - 1]];
      if (wantMax ? last <= values[i] : last >= values[i]) deque.pop();
      else break;
    }
    deque.push(i);
    if (i >= 1) out[i] = values[deque[0]];
  }
  return out;
}

/** Count of consecutive rising (dir=1) or falling (dir=-1) closes ending at each bar. */
export function consecutive(closes: number[], dir: 1 | -1): Series {
  const out: Series = new Array(closes.length).fill(null);
  let run = 0;
  out[0] = 0;
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const matches = dir === 1 ? change > 0 : change < 0;
    run = matches ? run + 1 : 0;
    out[i] = run;
  }
  return out;
}

/** Percent distance of `a` from `b`: positive means a is above b. */
export function pctDistance(a: number | null, b: number | null): number | null {
  if (!isNum(a) || !isNum(b) || b === 0) return null;
  return ((a - b) / b) * 100;
}

/** True when `series` moved from at-or-below `level` to above it on this bar. */
export function crossedAbove(series: Series, level: Series | number, i: number): boolean {
  if (i < 1) return false;
  const cur = series[i];
  const prev = series[i - 1];
  const curL = typeof level === "number" ? level : level[i];
  const prevL = typeof level === "number" ? level : level[i - 1];
  if (!isNum(cur) || !isNum(prev) || !isNum(curL) || !isNum(prevL)) return false;
  return prev <= prevL && cur > curL;
}

export function crossedBelow(series: Series, level: Series | number, i: number): boolean {
  if (i < 1) return false;
  const cur = series[i];
  const prev = series[i - 1];
  const curL = typeof level === "number" ? level : level[i];
  const prevL = typeof level === "number" ? level : level[i - 1];
  if (!isNum(cur) || !isNum(prev) || !isNum(curL) || !isNum(prevL)) return false;
  return prev >= prevL && cur < curL;
}

/** Slope of a series over `lookback` bars, as a percent of the earlier value. */
export function slopePct(series: Series, i: number, lookback = 5): number | null {
  const cur = series[i];
  const prev = series[i - lookback];
  if (!isNum(cur) || !isNum(prev) || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}
