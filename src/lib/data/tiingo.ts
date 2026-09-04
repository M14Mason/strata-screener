import "server-only";
import type { Bar, Fundamentals, Listing, MarketDataProvider, Profile, Quote } from "./types";
import { EMPTY_FUNDAMENTALS } from "./types";
import { allListings, getProfile, getProfiles } from "./reference";
import { cacheGet, cacheSet, msUntilNextClose, pool } from "./cache";
import { fetchWithRetry, ProviderError } from "./http";

/**
 * Tiingo end-of-day prices. Free tier is generous for daily bars but is
 * per-symbol, so whole-universe scans are slower than Polygon's grouped feed.
 * Requires TIINGO_API_KEY.
 */

const BASE = "https://api.tiingo.com/tiingo/daily";
const DAY_MS = 86_400_000;

function apiKey(): string {
  const key = process.env.TIINGO_API_KEY;
  if (!key) {
    throw new ProviderError(
      "TIINGO_API_KEY is not set. Add it to .env.local, or set MARKET_DATA_PROVIDER to bundle or demo.",
      401,
      false
    );
  }
  return key;
}

interface TiingoBar {
  date: string;
  adjOpen: number;
  adjHigh: number;
  adjLow: number;
  adjClose: number;
  adjVolume: number;
}

export class TiingoProvider implements MarketDataProvider {
  readonly id = "tiingo";
  readonly label = "Tiingo";
  readonly freshness = {
    provider: "tiingo",
    providerLabel: "Tiingo",
    isDemo: false,
    latency: "eod" as const,
    note: "Split- and dividend-adjusted end-of-day bars from Tiingo.",
  };

  private readonly concurrency = Number(process.env.PROVIDER_CONCURRENCY || 8);

  async getUniverse(): Promise<Listing[]> {
    return allListings();
  }

  async getProfiles(symbols: string[]): Promise<Record<string, Profile>> {
    return getProfiles(symbols);
  }

  async getHistoricalPrices(symbol: string, lookback: number): Promise<Bar[]> {
    const s = symbol.toUpperCase();
    const key = `tiingo/bars/${s}/${lookback}`;
    const cached = await cacheGet<Bar[]>(key);
    if (cached) return cached;

    const start = new Date(Date.now() - lookback * 1.5 * DAY_MS).toISOString().slice(0, 10);
    const url = `${BASE}/${encodeURIComponent(s)}/prices?startDate=${start}&format=json`;
    const res = await fetchWithRetry(url, {
      label: "Tiingo",
      // The token goes in a header rather than the query string so it never
      // ends up in a proxy or CDN access log.
      headers: { authorization: `Token ${apiKey()}` },
      timeoutMs: 20_000,
      attempts: 3,
    });
    const rows = (await res.json()) as TiingoBar[];
    const bars: Bar[] = rows
      .map((r) => ({
        t: Date.parse(r.date),
        o: r.adjOpen,
        h: r.adjHigh,
        l: r.adjLow,
        c: r.adjClose,
        v: r.adjVolume,
      }))
      .slice(-lookback);
    if (bars.length) await cacheSet(key, bars, msUntilNextClose());
    return bars;
  }

  async getHistoricalPricesBatch(
    symbols: string[],
    lookback: number,
    onProgress?: (done: number, total: number) => void
  ): Promise<Map<string, Bar[]>> {
    const out = new Map<string, Bar[]>();
    await pool(
      symbols,
      this.concurrency,
      async (symbol) => {
        try {
          const bars = await this.getHistoricalPrices(symbol, lookback);
          if (bars.length) out.set(symbol.toUpperCase(), bars);
        } catch {
          // Missing symbols are reported through scan coverage.
        }
      },
      onProgress
    );
    return out;
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    const bars = await this.getHistoricalPrices(symbol, 5);
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
    // Tiingo's fundamentals endpoint is a paid add-on; report what the bundled
    // reference layer knows and mark the rest unavailable.
    return { ...EMPTY_FUNDAMENTALS, marketCap: getProfile(symbol).marketCap };
  }
}
