import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { Bar, Fundamentals, Listing, MarketDataProvider, Profile, Quote } from "./types";
import { EMPTY_FUNDAMENTALS } from "./types";
import { allListings, getListing, getProfile, getProfiles } from "./reference";
import { planeBytes, readHeader, VOLUME_SCALE, type BundleHeader } from "./bundle-format";

/**
 * Reads a prebuilt end-of-day dataset from disk.
 *
 * This is the provider a deployed instance should run. Screening is an
 * end-of-day activity, so there is no reason for a page load to trigger
 * thousands of vendor API calls: a scheduled job builds one dataset a day, and
 * the app serves every request out of it with no network access at all.
 *
 * That makes the hosted app fast, free to run, and unable to break because a
 * vendor rate-limited the server's IP.
 *
 * Build the file with `npm run data:bundle` (see scripts/build-bundle.mts).
 */

const DEFAULT_PATH = "data/eod-bundle.bin";

interface Loaded {
  header: BundleHeader;
  open: Float32Array;
  high: Float32Array;
  low: Float32Array;
  close: Float32Array;
  volume: Float32Array;
  rowBySymbol: Map<string, number>;
  builtAt: number;
}

let loaded: Loaded | null | undefined;

export function bundlePath(): string {
  return path.resolve(process.cwd(), process.env.EOD_BUNDLE_PATH || DEFAULT_PATH);
}

/** Loads and caches the dataset. Returns null when the file is absent. */
export function loadBundle(): Loaded | null {
  if (loaded !== undefined) return loaded;

  const file = bundlePath();
  if (!fs.existsSync(file)) {
    loaded = null;
    return null;
  }

  const raw = fs.readFileSync(file);
  // Copy into a standalone ArrayBuffer: Node may hand back a slice of a shared
  // pool, and the typed-array views below assume they own their offsets.
  const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  const header = readHeader(buffer);

  const count = header.symbols * header.sessions;
  const size = planeBytes(header.symbols, header.sessions);
  let offset = header.dataOffset;
  const plane = () => {
    const view = new Float32Array(buffer, offset, count);
    offset += size;
    return view;
  };

  const open = plane();
  const high = plane();
  const low = plane();
  const close = plane();
  const volume = plane();

  const rowBySymbol = new Map<string, number>();
  header.names.forEach((symbol, i) => rowBySymbol.set(symbol, i));

  loaded = {
    header,
    open,
    high,
    low,
    close,
    volume,
    rowBySymbol,
    builtAt: fs.statSync(file).mtimeMs,
  };
  return loaded;
}

/** Forget the cached dataset so a redeploy or rebuild is picked up. */
export function resetBundle() {
  loaded = undefined;
}

function barsFor(data: Loaded, symbol: string, lookback: number): Bar[] {
  const row = data.rowBySymbol.get(symbol);
  if (row === undefined) return [];

  const { sessions, dates } = data.header;
  const base = row * sessions;
  const start = Math.max(0, sessions - lookback);
  const bars: Bar[] = [];

  for (let i = start; i < sessions; i++) {
    const close = data.close[base + i];
    // NaN marks a session the symbol did not trade (or did not yet exist).
    // Skipping keeps indicators on real sessions rather than interpolating.
    if (!Number.isFinite(close)) continue;
    bars.push({
      t: dates[i],
      o: data.open[base + i],
      h: data.high[base + i],
      l: data.low[base + i],
      c: close,
      v: data.volume[base + i] * VOLUME_SCALE,
    });
  }
  return bars;
}

export interface BundleStatus {
  present: boolean;
  path: string;
  asOf: number | null;
  sessions: number;
  symbols: number;
  builtAt: number | null;
  sizeBytes: number | null;
}

export function bundleStatus(): BundleStatus {
  const file = bundlePath();
  const data = loadBundle();
  if (!data) return { present: false, path: file, asOf: null, sessions: 0, symbols: 0, builtAt: null, sizeBytes: null };
  return {
    present: true,
    path: file,
    asOf: data.header.asOf,
    sessions: data.header.sessions,
    symbols: data.header.symbols,
    builtAt: data.builtAt,
    sizeBytes: fs.statSync(file).size,
  };
}

export class BundleProvider implements MarketDataProvider {
  readonly id = "bundle";
  readonly label = "Prebuilt EOD dataset";
  readonly freshness = {
    provider: "bundle",
    providerLabel: "Prebuilt EOD dataset",
    isDemo: false,
    latency: "eod" as const,
    note: "End-of-day bars from a dataset built after the last US close. No live quotes.",
  };

  private require(): Loaded {
    const data = loadBundle();
    if (!data) {
      throw new Error(
        `No dataset found at ${bundlePath()}. Build one with "npm run data:bundle" (needs POLYGON_API_KEY), or set MARKET_DATA_PROVIDER to demo, polygon or tiingo.`
      );
    }
    return data;
  }

  async getUniverse(): Promise<Listing[]> {
    const data = loadBundle();
    if (!data) return allListings();
    // Only listings the dataset actually covers, so the scan count is honest.
    return allListings().filter((l) => data.rowBySymbol.has(l.symbol));
  }

  async getProfiles(symbols: string[]): Promise<Record<string, Profile>> {
    return getProfiles(symbols);
  }

  async getHistoricalPrices(symbol: string, lookback: number): Promise<Bar[]> {
    return barsFor(this.require(), symbol.toUpperCase(), lookback);
  }

  async getHistoricalPricesBatch(
    symbols: string[],
    lookback: number,
    onProgress?: (done: number, total: number) => void
  ): Promise<Map<string, Bar[]>> {
    const data = this.require();
    const out = new Map<string, Bar[]>();
    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i].toUpperCase();
      const bars = barsFor(data, symbol, lookback);
      if (bars.length) out.set(symbol, bars);
      if (onProgress && i % 1000 === 0) onProgress(i, symbols.length);
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
      change: last.c - prev.c,
      changePct: prev.c ? ((last.c - prev.c) / prev.c) * 100 : 0,
      volume: last.v,
      previousClose: prev.c,
      asOf: last.t,
    };
  }

  async getFundamentals(symbol: string): Promise<Fundamentals> {
    // The dataset carries prices only. Market cap comes from the bundled
    // reference layer; everything else is honestly reported as unavailable.
    const s = symbol.toUpperCase();
    const listing = getListing(s);
    return { ...EMPTY_FUNDAMENTALS, marketCap: listing ? getProfile(s).marketCap : null };
  }
}
