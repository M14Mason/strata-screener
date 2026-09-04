import "server-only";
import type { Bar, Fundamentals, Listing, MarketDataProvider, Profile, Quote } from "./types";
import { allListings, getListing, getProfile, getProfiles } from "./reference";

/**
 * Deterministic synthetic price data.
 *
 * This exists so the app is fully explorable with zero API keys and zero
 * network calls. The numbers are NOT market data and the UI badges every
 * screen with DEMO DATA while this provider is active.
 *
 * Prices are a seeded geometric random walk: same symbol always produces the
 * same series, so screens are reproducible and the chart on the stock page
 * matches the row in the results table.
 */

const DAY_MS = 86_400_000;

/** xmur3 string hash -> 32-bit seed. */
function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^= h >>> 16) >>> 0;
}

/** mulberry32 PRNG - small, fast, good enough for plausible price paths. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller: uniform -> standard normal. */
function gauss(rand: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** The most recent completed US trading session (weekends roll back to Friday). */
export function lastTradingDay(now = new Date()): number {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.getTime();
}

/** Walk back `count` weekdays from `endMs`, oldest first. */
function tradingDays(endMs: number, count: number): number[] {
  const out: number[] = [];
  let t = endMs;
  while (out.length < count) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) out.push(t);
    t -= DAY_MS;
  }
  return out.reverse();
}

const barCache = new Map<string, Bar[]>();

function generate(symbol: string, profile: Profile, lookback: number, isEtf = false): Bar[] {
  const cacheKey = `${symbol}:${lookback}:${isEtf ? 1 : 0}`;
  const hit = barCache.get(cacheKey);
  if (hit) return hit;

  const rand = rng(hashSeed(symbol));
  const cap = profile.marketCap ?? 0;

  // Larger companies get lower daily volatility; micro caps get the wide,
  // gappy behaviour that makes liquidity filters matter.
  //
  // ETFs are handled separately: the reference data carries no market cap for
  // them, so a cap-derived tier would put every fund in the micro-cap bucket
  // and price SPY at a couple of dollars. A basket is also structurally less
  // volatile than any single holding, which the lower vol reflects.
  const capTier = cap > 2e11 ? 4 : cap > 1e10 ? 3 : cap > 2e9 ? 2 : cap > 3e8 ? 1 : 0;
  const dailyVol = isEtf ? 0.009 + rand() * 0.008 : [0.045, 0.033, 0.024, 0.018, 0.014][capTier];

  // Log price = a straight trend line plus a mean-reverting deviation.
  //
  // A plain random walk on the daily return compounds its own drift and,
  // over 300 sessions, happily turns a $2 micro cap into a $2,000 one. An
  // Ornstein-Uhlenbeck deviation around an explicit trend keeps the series
  // inside a believable band while still producing the trends, pullbacks and
  // ranges that moving-average and RSI screens are meant to find.
  const annualTrend = (rand() - 0.45) * (isEtf ? 0.45 : 0.9); // roughly -40% to +50% a year
  const trendPerDay = Math.log(1 + annualTrend) / 252;
  const reversion = 0.965;
  const devShock = dailyVol * 0.85;

  const basePrice = isEtf ? 22 + rand() * 430 : [2.5, 9, 28, 74, 190][capTier] * (0.4 + rand() * 1.8);
  const days = tradingDays(lastTradingDay(), lookback);
  const bars: Bar[] = [];

  // Volume is derived from dollar turnover rather than share count, because
  // the share count implied by a real market cap and a synthetic price is
  // meaningless. A daily turnover of roughly 0.2%-1.5% of market cap keeps the
  // numbers in the range a real tape would show.
  const turnover = 0.002 + rand() * 0.013;
  const baseVolume = isEtf
    ? 90_000 + rand() * rand() * 60_000_000
    : clamp(cap > 0 ? (cap * turnover) / basePrice : 400_000 + rand() * 1_200_000, 20_000, 120_000_000);

  let dev = gauss(rand) * devShock * 2;
  let logTrend = 0;
  let prevClose = basePrice;

  for (let i = 0; i < days.length; i++) {
    logTrend += trendPerDay;

    // Rare news-style jump, bounded so no single day can be absurd.
    const jump = rand() < 0.01 ? clamp(gauss(rand) * dailyVol * 4, -0.18, 0.18) : 0;
    dev = dev * reversion + gauss(rand) * devShock + jump;
    dev = clamp(dev, -1.1, 1.1);

    const close = Math.max(0.05, basePrice * Math.exp(logTrend + dev));

    // Open gaps modestly from the previous close; the high/low bracket both.
    const gap = clamp(gauss(rand) * dailyVol * 0.4, -0.09, 0.09);
    const open = Math.max(0.05, prevClose * (1 + gap));
    // The open-to-close move already accounts for most of the day's range, so
    // the wicks beyond it are deliberately small.
    const wick = Math.min(0.12, dailyVol * (0.25 + Math.abs(gauss(rand)) * 0.35));
    const top = Math.max(open, close);
    const bottom = Math.min(open, close);
    const high = top * (1 + wick * (0.2 + rand() * 0.6));
    const low = Math.max(0.01, bottom * (1 - wick * (0.2 + rand() * 0.6)));

    const move = Math.abs(close / prevClose - 1);
    const volSpike = rand() < 0.045 ? 1.7 + rand() * 2.4 : 1;
    const volume = Math.round(baseVolume * (0.6 + rand() * 0.8) * volSpike * (1 + move * 10));

    bars.push({ t: days[i], o: round(open), h: round(high), l: round(low), c: round(close), v: volume });
    prevClose = close;
  }

  barCache.set(cacheKey, bars);
  return bars;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

const round = (n: number) => Math.round(n * 100) / 100;

function fundamentalsFor(symbol: string, profile: Profile, price: number): Fundamentals {
  const rand = rng(hashSeed(`${symbol}:fundamentals`));
  const cap = profile.marketCap;
  const profitable = rand() > 0.32;
  const eps = profitable ? round(price / (8 + rand() * 45)) : round(-price / (10 + rand() * 60));
  const revenue = cap ? cap * (0.25 + rand() * 1.4) : null;
  const margin = profitable ? round(2 + rand() * 28) : round(-(2 + rand() * 40));

  return {
    marketCap: cap,
    peRatio: eps > 0 ? round(price / eps) : null,
    forwardPe: eps > 0 ? round((price / eps) * (0.75 + rand() * 0.4)) : null,
    eps,
    epsGrowth: round((rand() - 0.35) * 70),
    revenue,
    revenueGrowth: round((rand() - 0.3) * 55),
    priceToSales: revenue && cap ? round(cap / revenue) : null,
    priceToBook: round(0.6 + rand() * 9),
    freeCashFlow: revenue ? Math.round(revenue * (rand() - 0.2) * 0.22) : null,
    debtToEquity: round(rand() * 2.4),
    profitMargin: margin,
    returnOnEquity: round((rand() - 0.25) * 45),
    dividendYield: rand() > 0.55 ? round(rand() * 5.5) : 0,
    beta: round(0.25 + rand() * 2.1),
  };
}

/** Beta is needed by the screener, so expose it without a full fundamentals fetch. */
export function demoBeta(symbol: string, profile: Profile): number {
  return fundamentalsFor(symbol, profile, 100).beta ?? 1;
}

export class DemoProvider implements MarketDataProvider {
  readonly id = "demo";
  readonly label = "Demo (synthetic)";
  readonly freshness = {
    provider: "demo",
    providerLabel: "Demo (synthetic)",
    isDemo: true,
    latency: "synthetic" as const,
    note: "Simulated prices generated locally. Not market data.",
  };

  async getUniverse(): Promise<Listing[]> {
    return allListings();
  }

  async getProfiles(symbols: string[]): Promise<Record<string, Profile>> {
    return getProfiles(symbols);
  }

  async getHistoricalPrices(symbol: string, lookback: number): Promise<Bar[]> {
    const s = symbol.toUpperCase();
    return generate(s, getProfile(s), lookback, getListing(s)?.isEtf ?? false);
  }

  async getHistoricalPricesBatch(
    symbols: string[],
    lookback: number,
    onProgress?: (done: number, total: number) => void
  ): Promise<Map<string, Bar[]>> {
    const out = new Map<string, Bar[]>();
    for (let i = 0; i < symbols.length; i++) {
      const s = symbols[i].toUpperCase();
      out.set(s, generate(s, getProfile(s), lookback, getListing(s)?.isEtf ?? false));
      if (onProgress && i % 500 === 0) onProgress(i, symbols.length);
    }
    onProgress?.(symbols.length, symbols.length);
    return out;
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    const bars = await this.getHistoricalPrices(symbol, 3);
    if (bars.length < 2) return null;
    const last = bars[bars.length - 1];
    const prev = bars[bars.length - 2];
    return {
      symbol: symbol.toUpperCase(),
      price: last.c,
      change: round(last.c - prev.c),
      changePct: round(((last.c - prev.c) / prev.c) * 100),
      volume: last.v,
      previousClose: prev.c,
      asOf: last.t,
    };
  }

  async getFundamentals(symbol: string): Promise<Fundamentals> {
    const s = symbol.toUpperCase();
    const bars = await this.getHistoricalPrices(s, 3);
    const price = bars.length ? bars[bars.length - 1].c : 50;
    return fundamentalsFor(s, getProfile(s), price);
  }
}
