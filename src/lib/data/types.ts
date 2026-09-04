/** Shared vocabulary between the app and whichever market-data source is wired in. */

export type Exchange = "NYSE" | "NASDAQ" | "AMEX";

export const SECTORS = [
  "Technology",
  "Healthcare",
  "Financials",
  "Energy",
  "Industrials",
  "Consumer",
  "Communication",
  "Utilities",
  "Real Estate",
  "Materials",
  "Miscellaneous",
] as const;

export type Sector = (typeof SECTORS)[number];

/** One daily OHLCV bar. `t` is a UTC midnight epoch in milliseconds. */
export interface Bar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/** Listing-level facts that do not change day to day. */
export interface Listing {
  symbol: string;
  name: string;
  exchange: Exchange;
  isEtf: boolean;
}

/** Slow-moving reference data attached to a listing. */
export interface Profile {
  sector: Sector | null;
  industry: string | null;
  marketCap: number | null;
  country: string | null;
  ipoYear: number | null;
}

export interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  previousClose: number;
  /** When the provider says this quote was captured. */
  asOf: number;
}

export interface Fundamentals {
  marketCap: number | null;
  peRatio: number | null;
  forwardPe: number | null;
  eps: number | null;
  epsGrowth: number | null;
  revenue: number | null;
  revenueGrowth: number | null;
  priceToSales: number | null;
  priceToBook: number | null;
  freeCashFlow: number | null;
  debtToEquity: number | null;
  profitMargin: number | null;
  returnOnEquity: number | null;
  dividendYield: number | null;
  beta: number | null;
}

/** Every field is nullable: "unavailable" is a first-class answer, never a zero. */
export const EMPTY_FUNDAMENTALS: Fundamentals = {
  marketCap: null,
  peRatio: null,
  forwardPe: null,
  eps: null,
  epsGrowth: null,
  revenue: null,
  revenueGrowth: null,
  priceToSales: null,
  priceToBook: null,
  freeCashFlow: null,
  debtToEquity: null,
  profitMargin: null,
  returnOnEquity: null,
  dividendYield: null,
  beta: null,
};

/**
 * How honest the app has to be about what the user is looking at. Surfaced
 * verbatim in the UI -- demo data is always badged as demo.
 */
export interface DataFreshness {
  /** Machine id of the active provider, e.g. "yahoo". */
  provider: string;
  /** Human label, e.g. "Yahoo Finance". */
  providerLabel: string;
  /** True when the numbers are synthetic. Drives the DEMO DATA banner. */
  isDemo: boolean;
  /** "realtime" | "delayed" | "eod" | "synthetic" */
  latency: "realtime" | "delayed" | "eod" | "synthetic";
  /** Free-text note shown next to the timestamp, e.g. "15-minute delayed". */
  note: string;
  /** Timestamp of the most recent bar the provider returned. */
  asOf: number | null;
}

/**
 * The seam every data source implements.
 *
 * Adding a provider means writing one of these and registering it in
 * `registry.ts` -- nothing else in the app imports a vendor SDK or URL.
 */
export interface MarketDataProvider {
  readonly id: string;
  readonly label: string;
  readonly freshness: Omit<DataFreshness, "asOf">;

  /** The tradable universe this provider can serve. */
  getUniverse(): Promise<Listing[]>;

  /** Reference data for a batch of symbols. Missing entries are allowed. */
  getProfiles(symbols: string[]): Promise<Record<string, Profile>>;

  /** Latest quote for one symbol. */
  getQuote(symbol: string): Promise<Quote | null>;

  /**
   * Daily bars, oldest first, at most `lookback` of them.
   * Returning fewer bars than asked for is fine; the engine degrades
   * indicators to null rather than guessing.
   */
  getHistoricalPrices(symbol: string, lookback: number): Promise<Bar[]>;

  /**
   * Bars for many symbols. Providers with a bulk endpoint should override the
   * default fan-out for speed.
   */
  getHistoricalPricesBatch(
    symbols: string[],
    lookback: number,
    onProgress?: (done: number, total: number) => void
  ): Promise<Map<string, Bar[]>>;

  getFundamentals(symbol: string): Promise<Fundamentals>;
}
