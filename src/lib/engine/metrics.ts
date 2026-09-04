import { ema, rsi, sma } from "@/lib/indicators";
import { HISTORY_DAYS, type SymbolSnapshot } from "./snapshot";

/**
 * Metric resolution.
 *
 * Common indicator periods are precomputed in the snapshot. Anything the user
 * types by hand (a custom RSI or moving-average period) is derived here from
 * the retained closes and memoised onto the snapshot, so a custom period costs
 * one pass per symbol per scan instead of being unavailable.
 */

type Kind = "sma" | "ema" | "rsi";

function computeCustom(snap: SymbolSnapshot, kind: Kind, period: number): (number | null)[] {
  const closes = snap.closes;
  const series = kind === "sma" ? sma(closes, period) : kind === "ema" ? ema(closes, period) : rsi(closes, period);
  const out: (number | null)[] = [];
  for (let i = 0; i < HISTORY_DAYS; i++) {
    const idx = series.length - 1 - i;
    out.push(idx >= 0 ? series[idx] : null);
  }
  return out;
}

/** Returns the trailing series for a metric id, computing custom periods lazily. */
export function resolveSeries(snap: SymbolSnapshot, metricId: string): (number | null)[] | null {
  const existing = snap.m[metricId];
  if (existing) return existing;

  const match = /^(sma|ema|rsi)(\d+)$/.exec(metricId);
  if (!match) return null;
  const period = Number(match[2]);
  if (!Number.isInteger(period) || period < 1 || period > 400) return null;

  const computed = computeCustom(snap, match[1] as Kind, period);
  snap.m[metricId] = computed;
  return computed;
}

/** Value of a metric `offset` trading days back (0 = today). */
export function valueAt(snap: SymbolSnapshot, metricId: string, offset: number): number | null {
  const series = resolveSeries(snap, metricId);
  if (!series || offset < 0 || offset >= series.length) return null;
  return series[offset];
}
