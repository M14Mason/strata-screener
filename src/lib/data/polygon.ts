import "server-only";
import type { Bar, Fundamentals, Listing, MarketDataProvider, Profile, Quote } from "./types";
import { EMPTY_FUNDAMENTALS } from "./types";
import { allListings, getProfile, getProfiles } from "./reference";
import { cacheGet, cacheSet, msUntilNextClose, pool } from "./cache";
import { fetchWithRetry, ProviderError, RateLimiter } from "./http";

/**
 * Polygon.io.
 *
 * The reason to prefer this provider for whole-market scanning is the grouped
 * daily bars endpoint: one request returns every US ticker for one session, so
 * building a 300-day history for 6,000 symbols costs ~300 requests instead of
 * ~6,000. `syncGroupedDaily` walks backwards day by day and caches each day.
 *
 * Requires POLYGON_API_KEY. The key is read server-side only.
 *
 * The free tier allows 5 requests a minute, and exceeding it throttles the whole
 * key rather than just the offending call, so every request goes through a token
 * bucket. Set POLYGON_RATE_LIMIT=0 on a paid plan to disable it.
 */

const BASE = "https://api.polygon.io";
const DAY_MS = 86_400_000;

interface GroupedResponse {
  status: string;
  resultsCount?: number;
  results?: Array<{ T: string; o: number; h: number; l: number; c: number; v: number; t: number }>;
}

interface AggsResponse {
  status: string;
  results?: Array<{ o: number; h: number; l: number; c: number; v: number; t: number }>;
}

function apiKey(): string {
  const key = process.env.POLYGON_API_KEY;
  if (!key) {
    throw new ProviderError(
      "POLYGON_API_KEY is not set. Add it to .env.local (free key at polygon.io), or set MARKET_DATA_PROVIDER to bundle or demo.",
      401,
      false
    );
  }
  return key;
}

// Free tier: 5 requests/minute. A paid plan can set POLYGON_RATE_LIMIT=0.
const limiter = new RateLimiter(Number(process.env.POLYGON_RATE_LIMIT ?? 5), 60_000);

async function getJson<T>(url: string): Promise<T> {
  const key = apiKey();
  await limiter.acquire();
  const res = await fetchWithRetry(url, {
    label: "Polygon.io",
    headers: { authorization: `Bearer ${key}` },
    timeoutMs: 25_000,
    attempts: 3,
  });
  return (await res.json()) as T;
}

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export class PolygonProvider implements MarketDataProvider {
  readonly id = "polygon";
  readonly label = "Polygon.io";
  readonly freshness = {
    provider: "polygon",
    providerLabel: "Polygon.io",
    isDemo: false,
    latency: "eod" as const,
    note: "End-of-day consolidated bars from Polygon.io.",
  };

  private readonly concurrency = Number(process.env.PROVIDER_CONCURRENCY || 5);

  async getUniverse(): Promise<Listing[]> {
    return allListings();
  }

  async getProfiles(symbols: string[]): Promise<Record<string, Profile>> {
    return getProfiles(symbols);
  }

  async getHistoricalPrices(symbol: string, lookback: number): Promise<Bar[]> {
    const s = symbol.toUpperCase();
    const key = `polygon/bars/${s}/${lookback}`;
    const cached = await cacheGet<Bar[]>(key);
    if (cached) return cached;

    const to = ymd(Date.now());
    const from = ymd(Date.now() - lookback * 1.5 * DAY_MS);
    const url = `${BASE}/v2/aggs/ticker/${encodeURIComponent(s)}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=50000`;
    const json = await getJson<AggsResponse>(url);
    const bars: Bar[] = (json.results ?? []).map((r) => ({ t: r.t, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v })).slice(-lookback);
    if (bars.length) await cacheSet(key, bars, msUntilNextClose());
    return bars;
  }

  /**
   * Pull one grouped-daily response per session and pivot it into per-symbol
   * series. Far cheaper than per-symbol aggregates for a full-universe scan.
   */
  async getHistoricalPricesBatch(
    symbols: string[],
    lookback: number,
    onProgress?: (done: number, total: number) => void
  ): Promise<Map<string, Bar[]>> {
    // Validate configuration before the worker pool starts. The pool catches
    // per-item failures so one bad symbol cannot abort a scan, which would
    // otherwise turn "no API key" into the far less useful "no sessions".
    apiKey();

    const wanted = new Set(symbols.map((s) => s.toUpperCase()));
    const bySymbol = new Map<string, Bar[]>();
    let fatal: unknown = null;

    // Walk back over calendar days, skipping weekends, until we have collected
    // `lookback` sessions (holidays return an empty result and are skipped).
    const days: string[] = [];
    let cursor = Date.now();
    let guard = 0;
    while (days.length < lookback && guard++ < lookback * 2 + 40) {
      const d = new Date(cursor);
      const dow = d.getUTCDay();
      if (dow !== 0 && dow !== 6) days.push(ymd(cursor));
      cursor -= DAY_MS;
    }
    days.reverse();

    let sessions = 0;
    await pool(
      days,
      this.concurrency,
      async (date) => {
        if (fatal) return;
        const key = `polygon/grouped/${date}`;
        let rows = await cacheGet<GroupedResponse["results"]>(key);
        if (!rows) {
          try {
            const json = await getJson<GroupedResponse>(
              `${BASE}/v2/aggs/grouped/locale/us/market/stocks/${date}?adjusted=true`
            );
            rows = json.results ?? [];
          } catch (error) {
            // An auth or plan problem affects every request, so stop rather
            // than working through 300 dates that will all fail the same way.
            if (error instanceof ProviderError && error.retryable === false) fatal = error;
            throw error;
          }
          // Past sessions never change, so cache them for a long time.
          await cacheSet(key, rows, rows.length ? 30 * 24 * 3600_000 : 3600_000);
        }
        if (rows.length) sessions++;
        for (const r of rows) {
          if (!wanted.has(r.T)) continue;
          const list = bySymbol.get(r.T) ?? [];
          list.push({ t: r.t, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v });
          bySymbol.set(r.T, list);
        }
      },
      onProgress
    );

    if (fatal) throw fatal;

    for (const bars of bySymbol.values()) bars.sort((a, b) => a.t - b.t);
    if (sessions === 0) {
      throw new ProviderError(
        "Polygon returned no trading sessions. Check that POLYGON_API_KEY is valid and that your plan covers historical aggregates.",
        undefined,
        false
      );
    }
    return bySymbol;
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    const s = symbol.toUpperCase();
    const json = await getJson<{ ticker?: { day?: { c: number; v: number }; prevDay?: { c: number }; todaysChange?: number; todaysChangePerc?: number; updated?: number } }>(
      `${BASE}/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(s)}`
    );
    const t = json.ticker;
    if (!t?.day || !t.prevDay) return null;
    return {
      symbol: s,
      price: t.day.c || t.prevDay.c,
      change: t.todaysChange ?? 0,
      changePct: t.todaysChangePerc ?? 0,
      volume: t.day.v ?? 0,
      previousClose: t.prevDay.c,
      asOf: t.updated ? Math.round(t.updated / 1e6) : Date.now(),
    };
  }

  async getFundamentals(symbol: string): Promise<Fundamentals> {
    const s = symbol.toUpperCase();
    const key = `polygon/fundamentals/${s}`;
    const cached = await cacheGet<Fundamentals>(key);
    if (cached) return cached;

    const profile = getProfile(s);
    const out: Fundamentals = { ...EMPTY_FUNDAMENTALS, marketCap: profile.marketCap };
    try {
      const json = await getJson<{ results?: Array<{ financials?: Record<string, { value?: number }> }> }>(
        `${BASE}/vX/reference/financials?ticker=${encodeURIComponent(s)}&limit=4&timeframe=quarterly`
      );
      const rows = json.results ?? [];
      const pick = (row: (typeof rows)[number], path: string) => {
        const f = row.financials as unknown as Record<string, Record<string, { value?: number }>> | undefined;
        const [group, field] = path.split(".");
        return f?.[group]?.[field]?.value ?? null;
      };
      if (rows.length) {
        const ttmRevenue = rows.slice(0, 4).reduce<number | null>((sum, r) => {
          const v = pick(r, "income_statement.revenues");
          return v == null ? sum : (sum ?? 0) + v;
        }, null);
        const ttmEps = rows.slice(0, 4).reduce<number | null>((sum, r) => {
          const v = pick(r, "income_statement.diluted_earnings_per_share");
          return v == null ? sum : (sum ?? 0) + v;
        }, null);
        out.revenue = ttmRevenue;
        out.eps = ttmEps;
        out.priceToSales = ttmRevenue && profile.marketCap ? profile.marketCap / ttmRevenue : null;
      }
    } catch {
      // Fundamentals are optional on the free tier; the UI shows "--".
    }
    await cacheSet(key, out, 24 * 3600_000);
    return out;
  }
}
