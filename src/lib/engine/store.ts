import "server-only";
import { getProvider } from "@/lib/data/provider";
import { getListing, getProfile } from "@/lib/data/reference";
import type { Listing } from "@/lib/data/types";
import { LOOKBACK_BARS, buildSnapshot, type SymbolSnapshot } from "./snapshot";

/**
 * The snapshot store.
 *
 * Indicator maths runs once per symbol per session and the result is kept in
 * process memory, so repeated scans -- which is what tuning a screen actually
 * looks like -- cost array lookups rather than a full recompute. Bars
 * themselves are cached to disk by the provider layer, so a restart is cheap
 * too.
 *
 * Snapshots are built in chunks rather than fetching every symbol's bars up
 * front. Raw bars are roughly half the memory of a scan and are dead weight the
 * moment the snapshot is built, so holding all of them at once put a
 * whole-universe scan over 700MB and out of memory on a small instance.
 * Chunking caps peak usage at one chunk of bars plus the snapshots themselves.
 */

/**
 * Symbols whose bars are held in memory at once while building snapshots.
 * Large enough that a bulk provider endpoint is still used efficiently, small
 * enough that the bars never dominate the heap.
 */
const BUILD_CHUNK = 400;

interface Entry {
  snapshot: SymbolSnapshot | null;
  builtAt: number;
}

const store = new Map<string, Entry>();
let storeProvider = "";

/** Snapshots are valid until the next US close; after that they are rebuilt. */
function sessionKey(): string {
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  // Anything before 16:15 ET still belongs to the previous session's data.
  if (et.getHours() < 16 || (et.getHours() === 16 && et.getMinutes() < 15)) {
    et.setDate(et.getDate() - 1);
  }
  return et.toISOString().slice(0, 10);
}

let storeSession = "";

function ensureGeneration(providerId: string) {
  const session = sessionKey();
  if (storeProvider !== providerId || storeSession !== session) {
    store.clear();
    storeProvider = providerId;
    storeSession = session;
  }
}

export interface SnapshotBatch {
  snapshots: SymbolSnapshot[];
  /** Symbols the provider could not serve. */
  missing: string[];
  /** How many came straight from memory. */
  cached: number;
}

export async function getSnapshots(
  symbols: string[],
  onProgress?: (done: number, total: number) => void
): Promise<SnapshotBatch> {
  const provider = getProvider();
  ensureGeneration(provider.id);

  const wanted = symbols.map((s) => s.toUpperCase());
  const need: string[] = [];
  const snapshots: SymbolSnapshot[] = [];
  const missing: string[] = [];
  let cached = 0;

  for (const symbol of wanted) {
    const hit = store.get(symbol);
    if (hit) {
      cached++;
      if (hit.snapshot) snapshots.push(hit.snapshot);
      else missing.push(symbol);
    } else {
      need.push(symbol);
    }
  }

  for (let start = 0; start < need.length; start += BUILD_CHUNK) {
    const chunk = need.slice(start, start + BUILD_CHUNK);
    const bars = await provider.getHistoricalPricesBatch(chunk, LOOKBACK_BARS, (done, total) =>
      onProgress?.(start + done, need.length)
    );

    for (const symbol of chunk) {
      const series = bars.get(symbol);
      const listing: Listing = getListing(symbol) ?? {
        symbol,
        name: symbol,
        exchange: "NASDAQ",
        isEtf: false,
      };
      const snapshot = series?.length ? buildSnapshot({ listing, profile: getProfile(symbol), bars: series }) : null;
      store.set(symbol, { snapshot, builtAt: Date.now() });
      if (snapshot) snapshots.push(snapshot);
      else missing.push(symbol);
    }

    // Drop this chunk's bars before the next fetch so they can be collected
    // rather than accumulating across the whole universe.
    bars.clear();
    onProgress?.(Math.min(start + chunk.length, need.length), need.length);
  }

  return { snapshots, missing, cached };
}

/** One symbol, for the stock detail page. */
export async function getSnapshot(symbol: string): Promise<SymbolSnapshot | null> {
  const batch = await getSnapshots([symbol]);
  return batch.snapshots[0] ?? null;
}

export function snapshotCacheStats() {
  return {
    provider: storeProvider,
    session: storeSession,
    symbols: store.size,
    withData: [...store.values()].filter((e) => e.snapshot).length,
  };
}

export function clearSnapshotCache() {
  store.clear();
}
