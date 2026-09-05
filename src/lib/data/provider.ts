import "server-only";
import type { MarketDataProvider } from "./types";
import { DemoProvider } from "./demo";
import { NasdaqProvider } from "./nasdaq";
import { BundleProvider, loadBundle } from "./bundle";
import { YahooProvider } from "./yahoo";
import { PolygonProvider } from "./polygon";
import { TiingoProvider } from "./tiingo";

/**
 * Provider registry.
 *
 * To add a data source: implement MarketDataProvider, add one line here, and
 * set MARKET_DATA_PROVIDER to its id. Nothing else in the app changes.
 */
const FACTORIES: Record<string, () => MarketDataProvider> = {
  bundle: () => new BundleProvider(),
  nasdaq: () => new NasdaqProvider(),
  demo: () => new DemoProvider(),
  yahoo: () => new YahooProvider(),
  polygon: () => new PolygonProvider(),
  tiingo: () => new TiingoProvider(),
};

export const PROVIDER_IDS = Object.keys(FACTORIES);

export const PROVIDER_NOTES: Record<string, string> = {
  bundle: "Serves a prebuilt end-of-day dataset. No API calls at request time — the right choice for a deployed instance.",
  nasdaq: "Real split-adjusted end-of-day bars from Nasdaq's public endpoint. No API key needed. The default when no dataset is installed.",
  demo: "Deterministic synthetic prices. No key, no network. Always badged as demo data.",
  yahoo: "Real delayed bars with no key, but an undocumented endpoint that rate-limits shared server IPs. Fine locally, unreliable when hosted.",
  polygon: "Real end-of-day data. Needs POLYGON_API_KEY. Its grouped-daily endpoint makes whole-market history cheap.",
  tiingo: "Real adjusted end-of-day data. Needs TIINGO_API_KEY. Per-symbol, so full-universe scans are slower.",
};

let cached: MarketDataProvider | null = null;
let cachedId: string | null = null;

/**
 * Resolves the configured provider.
 *
 * When nothing is configured: use a prebuilt dataset if one shipped with the
 * deployment, otherwise fetch real bars from Nasdaq. Demo data is now only ever
 * used when it is asked for explicitly, so nobody ends up looking at simulated
 * prices by accident.
 */
export function resolveProviderId(): string {
  const configured = process.env.MARKET_DATA_PROVIDER?.trim().toLowerCase();
  if (configured) return configured;
  try {
    if (loadBundle()) return "bundle";
  } catch {
    // A malformed dataset should not stop the app booting.
  }
  return "nasdaq";
}

export function getProvider(): MarketDataProvider {
  const id = resolveProviderId();
  if (cached && cachedId === id) return cached;

  const factory = FACTORIES[id];
  if (!factory) {
    throw new Error(`Unknown MARKET_DATA_PROVIDER "${id}". Available: ${PROVIDER_IDS.join(", ")}`);
  }
  cached = factory();
  cachedId = id;
  return cached;
}

export function resetProvider() {
  cached = null;
  cachedId = null;
}
