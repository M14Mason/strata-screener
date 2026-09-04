import "server-only";
import type { Bar, Fundamentals, Listing, MarketDataProvider, Profile, Quote } from "./types";
import { EMPTY_FUNDAMENTALS } from "./types";
import { allListings, getProfile, getProfiles } from "./reference";
import { cacheGet, cacheSet, msUntilNextClose, pool } from "./cache";
import { fetchWithRetry, ProviderError } from "./http";

/**
 * Yahoo Finance's public chart endpoint.
 *
 * No API key, real daily OHLCV. It is an undocumented public endpoint rather
 * than a contracted feed: it rate-limits hard (HTTP 429), and it is much more
 * aggressive about it toward datacenter IPs than residential ones. That makes
 * it fine for local use and unreliable for a deployed instance -- a hosted
 * deployment should use the `bundle` provider or a keyed feed instead.
 *
 * Requests therefore retry with backoff, alternate between Yahoo's two API
 * hosts, and surface a message that says what to do rather than "fetch failed".
 *
 * Only prices come from here; sector / market-cap reference data comes from the
 * bundled reference layer because the quoteSummary endpoint now requires a
 * session crumb.
 */

// Yahoo runs two interchangeable API hosts; alternating spreads the load and
// often gets through when one of them is throttling.
const HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
let hostCursor = 0;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36";

interface YahooChart {
  chart: {
    result?: Array<{
      meta: { regularMarketPrice?: number; chartPreviousClose?: number; regularMarketTime?: number };
      timestamp?: number[];
      indicators: {
        quote: Array<{ open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }>;
        adjclose?: Array<{ adjclose?: (number | null)[] }>;
      };
    }>;
    error?: { code: string; description: string } | null;
  };
}

function rangeFor(lookback: number): string {
  if (lookback <= 130) return "6mo";
  if (lookback <= 260) return "1y";
  if (lookback <= 520) return "2y";
  if (lookback <= 1300) return "5y";
  return "10y";
}

async function fetchChart(symbol: string, range: string, interval = "1d"): Promise<Bar[]> {
  const host = HOSTS[hostCursor++ % HOSTS.length];
  const url = `${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;
  const res = await fetchWithRetry(url, {
    label: "Yahoo Finance",
    headers: { "user-agent": UA, accept: "application/json", "accept-language": "en-US,en;q=0.9" },
    timeoutMs: 15_000,
    attempts: 3,
  });
  const json = (await res.json()) as YahooChart;
  const r = json.chart?.result?.[0];
  if (!r?.timestamp) return [];

  const q = r.indicators.quote[0] ?? {};
  const adj = r.indicators.adjclose?.[0]?.adjclose;
  const bars: Bar[] = [];

  for (let i = 0; i < r.timestamp.length; i++) {
    const o = q.open?.[i];
    const h = q.high?.[i];
    const l = q.low?.[i];
    const c = q.close?.[i];
    const v = q.volume?.[i];
    // Yahoo pads holidays and halted sessions with nulls; skip rather than
    // interpolate, so indicators are computed on real sessions only.
    if (o == null || h == null || l == null || c == null) continue;

    // Split/dividend-adjust the whole bar by the close's adjustment factor so
    // moving averages don't jump on ex-dates.
    const factor = adj?.[i] != null && c !== 0 ? (adj[i] as number) / c : 1;
    bars.push({
      t: r.timestamp[i] * 1000,
      o: o * factor,
      h: h * factor,
      l: l * factor,
      c: c * factor,
      v: v ?? 0,
    });
  }
  return bars;
}

export class YahooProvider implements MarketDataProvider {
  readonly id = "yahoo";
  readonly label = "Yahoo Finance";
  readonly freshness = {
    provider: "yahoo",
    providerLabel: "Yahoo Finance",
    isDemo: false,
    latency: "delayed" as const,
    note: "Delayed end-of-day bars from Yahoo Finance's public chart endpoint.",
  };

  private readonly concurrency = Number(process.env.PROVIDER_CONCURRENCY || 12);

  async getUniverse(): Promise<Listing[]> {
    return allListings();
  }

  async getProfiles(symbols: string[]): Promise<Record<string, Profile>> {
    return getProfiles(symbols);
  }

  async getHistoricalPrices(symbol: string, lookback: number): Promise<Bar[]> {
    const s = symbol.toUpperCase();
    const range = rangeFor(lookback);
    const key = `yahoo/bars/${s}/${range}`;
    const cached = await cacheGet<Bar[]>(key);
    if (cached) return cached.slice(-lookback);

    const bars = await fetchChart(s, range);
    if (bars.length) await cacheSet(key, bars, msUntilNextClose());
    return bars.slice(-lookback);
  }

  async getHistoricalPricesBatch(
    symbols: string[],
    lookback: number,
    onProgress?: (done: number, total: number) => void
  ): Promise<Map<string, Bar[]>> {
    const out = new Map<string, Bar[]>();
    let rateLimited = 0;

    await pool(
      symbols,
      this.concurrency,
      async (symbol) => {
        try {
          const bars = await this.getHistoricalPrices(symbol, lookback);
          if (bars.length) out.set(symbol.toUpperCase(), bars);
        } catch (error) {
          // A symbol Yahoo cannot serve is simply absent from the scan, and the
          // engine reports coverage so the gap is visible. Being throttled is
          // different: it is not a property of the symbol, and silently
          // returning an almost-empty scan would be a lie about the market.
          if (error instanceof ProviderError && error.status === 429) rateLimited++;
        }
      },
      onProgress
    );

    if (out.size === 0 && rateLimited > 0) {
      throw new ProviderError(
        `Yahoo Finance rate-limited every request (${rateLimited} of ${symbols.length}). ` +
          `Yahoo throttles shared server IPs aggressively. Use the "bundle" provider for a deployed instance, ` +
          `or set MARKET_DATA_PROVIDER to polygon or tiingo with an API key.`,
        429,
        true
      );
    }
    return out;
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    const bars = await fetchChart(symbol.toUpperCase(), "5d");
    if (bars.length < 2) return null;
    const last = bars[bars.length - 1];
    const prev = bars[bars.length - 2];
    return {
      symbol: symbol.toUpperCase(),
      price: last.c,
      change: last.c - prev.c,
      changePct: ((last.c - prev.c) / prev.c) * 100,
      volume: last.v,
      previousClose: prev.c,
      asOf: last.t,
    };
  }

  async getFundamentals(symbol: string): Promise<Fundamentals> {
    // Yahoo's fundamentals modules require a session crumb this provider does
    // not maintain. Market cap comes from the bundled reference layer; the rest
    // is reported as unavailable rather than invented.
    const profile = getProfile(symbol);
    return { ...EMPTY_FUNDAMENTALS, marketCap: profile.marketCap };
  }
}
