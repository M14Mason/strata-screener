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
 */

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

  if (need.length) {
    const bars = await provider.getHistoricalPricesBatch(need, LOOKBACK_BARS, onProgress);
    for (const symbol of need) {
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
