import { ema, rsi, sma } from "@/lib/indicators";
import { HISTORY_DAYS, METRIC_INDEX, metricValue, type SymbolSnapshot } from "./snapshot";

/**
 * Metric resolution.
 *
 * Common indicator periods are packed into the snapshot at build time. Anything
 * the user types by hand -- a custom RSI or moving-average period -- is derived
 * here from the retained closes and memoised onto the snapshot, so a custom
 * period costs one pass per symbol per scan instead of being unavailable.
 */

type Kind = "sma" | "ema" | "rsi";

function computeCustom(snap: SymbolSnapshot, kind: Kind, period: number): Float64Array {
  const closes = Array.from(snap.closes);
  const series = kind === "sma" ? sma(closes, period) : kind === "ema" ? ema(closes, period) : rsi(closes, period);
  const out = new Float64Array(HISTORY_DAYS);
  out.fill(NaN);
  for (let i = 0; i < HISTORY_DAYS; i++) {
    const idx = series.length - 1 - i;
    const v = idx >= 0 ? series[idx] : null;
    if (v != null && Number.isFinite(v)) out[i] = v;
  }
  return out;
}

/**
 * Ensures a metric exists on the snapshot, computing custom periods lazily.
 * Returns false for ids that are neither built in nor derivable.
 */
export function ensureMetric(snap: SymbolSnapshot, metricId: string): boolean {
  if (METRIC_INDEX[metricId] !== undefined) return true;
  if (snap.extra?.has(metricId)) return true;

  const match = /^(sma|ema|rsi)(\d+)$/.exec(metricId);
  if (!match) return false;
  const period = Number(match[2]);
  if (!Number.isInteger(period) || period < 1 || period > 400) return false;

  const computed = computeCustom(snap, match[1] as Kind, period);
  (snap.extra ??= new Map()).set(metricId, computed);
  return true;
}

/** Value of a metric `offset` trading days back (0 = today). */
export function valueAt(snap: SymbolSnapshot, metricId: string, offset: number): number | null {
  if (!ensureMetric(snap, metricId)) return null;
  return metricValue(snap, metricId, offset);
}
