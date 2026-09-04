import "server-only";
import { getProvider } from "@/lib/data/provider";
import { allListings, getProfile } from "@/lib/data/reference";
import { demoBeta } from "@/lib/data/demo";
import type { DataFreshness, Listing, Sector } from "@/lib/data/types";
import { MARKET_CAP_TIERS, type BasicFilters, type MarketCapTier, type ScreenRequest, type UniverseSpec } from "./filters";
import { evaluateRules, validateRuleNode, type ConditionResult, type RuleGroup, type TraceNode } from "./rules";
import { getSnapshots } from "./store";
import { metricValue, type SymbolSnapshot } from "./snapshot";

/**
 * Scan orchestration.
 *
 * The ordering here is what keeps a whole-universe scan quick: everything that
 * can be decided from bundled reference data (exchange, ETF flag, sector,
 * market cap) is applied *before* any price data is fetched, so the expensive
 * step only ever runs on symbols that could still match.
 */

export interface ResultRow {
  symbol: string;
  name: string;
  exchange: string;
  sector: Sector | null;
  industry: string | null;
  isEtf: boolean;
  price: number | null;
  changePct: number | null;
  volume: number | null;
  avgVolume: number | null;
  relVolume: number | null;
  dollarVolume: number | null;
  marketCap: number | null;
  rsi2: number | null;
  rsi14: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  distSma50: number | null;
  distSma200: number | null;
  pctFrom52High: number | null;
  atrPct: number | null;
  adx: number | null;
  mom20: number | null;
  beta: number | null;
  peRatio: number | null;
  eps: number | null;
  dividendYield: number | null;
  /** Why this row matched - one entry per condition in the strategy. */
  reasons: ConditionResult[];
  /** The same outcome as a tree, so ANY / NONE groups render honestly. */
  trace: TraceNode | null;
}

export interface ScanMeta {
  universeSize: number;
  /** After reference-data prefiltering. */
  eligible: number;
  /** Symbols we actually loaded price data for. */
  scanned: number;
  matches: number;
  /** Rows returned after the display limit. */
  returned: number;
  /** Symbols the provider had no usable history for. */
  noData: number;
  /** True when the scan was capped and did not cover every eligible symbol. */
  truncated: boolean;
  elapsedMs: number;
  freshness: DataFreshness;
}

export interface ScanResponse {
  rows: ResultRow[];
  meta: ScanMeta;
}

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/** Hard ceiling on symbols per scan, so one request cannot pin the server. */
function scanCap(providerId: string): number {
  const fromEnv = Number(process.env.SCAN_MAX_SYMBOLS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  // Synthetic data is generated locally, so the whole universe is affordable.
  // Network providers pay a request per symbol, so they get a smaller default.
  return providerId === "demo" ? 20_000 : 1_200;
}

function matchesUniverse(listing: Listing, spec: UniverseSpec, watchlist: Set<string> | null): boolean {
  if (spec.scope === "watchlist") return watchlist ? watchlist.has(listing.symbol) : false;
  if (spec.scope === "etf") return listing.isEtf;
  if (listing.isEtf && !spec.includeEtfs) return false;
  if (spec.scope === "nasdaq") return listing.exchange === "NASDAQ";
  if (spec.scope === "nyse") return listing.exchange === "NYSE";
  if (spec.scope === "amex") return listing.exchange === "AMEX";
  return true;
}

/** Filters decidable without price data. Runs first and cuts the work sharply. */
function passesReferenceFilters(symbol: string, filters: BasicFilters): boolean {
  const profile = getProfile(symbol);

  if (filters.sectors?.length) {
    if (!profile.sector || !filters.sectors.includes(profile.sector)) return false;
  }

  const cap = profile.marketCap;
  if (filters.marketCapTiers?.length) {
    if (cap == null) return false;
    const inTier = filters.marketCapTiers.some((id) => {
      const tier = MARKET_CAP_TIERS.find((t) => t.id === id);
      if (!tier) return false;
      return cap >= tier.min && (tier.max == null || cap < tier.max);
    });
    if (!inTier) return false;
  }
  if (filters.marketCapMin != null && (cap == null || cap < filters.marketCapMin)) return false;
  if (filters.marketCapMax != null && (cap == null || cap > filters.marketCapMax)) return false;

  return true;
}

/** Filters that need the snapshot's price and indicator values. */
function passesPriceFilters(snap: SymbolSnapshot, filters: BasicFilters, universe: UniverseSpec): boolean {
  const price = metricValue(snap, "close");
  if (price == null) return false;

  if (universe.excludePenny && price < universe.pennyThreshold) return false;
  if (filters.priceMin != null && price < filters.priceMin) return false;
  if (filters.priceMax != null && price > filters.priceMax) return false;

  const volume = metricValue(snap, "volume");
  if (filters.volumeMin != null && (volume == null || volume < filters.volumeMin)) return false;

  const avgVol = metricValue(snap, "avgVol20");
  if (filters.avgVolumeMin != null && (avgVol == null || avgVol < filters.avgVolumeMin)) return false;

  const dollarVol = metricValue(snap, "dollarVol20");
  if (filters.dollarVolumeMin != null && (dollarVol == null || dollarVol < filters.dollarVolumeMin)) return false;

  if (filters.betaMin != null && (snap.beta == null || snap.beta < filters.betaMin)) return false;
  if (filters.betaMax != null && (snap.beta == null || snap.beta > filters.betaMax)) return false;

  if (filters.dividendYieldMin != null && (snap.dividendYield == null || snap.dividendYield < filters.dividendYieldMin)) return false;
  if (filters.dividendYieldMax != null && (snap.dividendYield == null || snap.dividendYield > filters.dividendYieldMax)) return false;

  if (filters.peMin != null && (snap.peRatio == null || snap.peRatio < filters.peMin)) return false;
  if (filters.peMax != null && (snap.peRatio == null || snap.peRatio > filters.peMax)) return false;

  if (filters.eps === "positive" && !(snap.eps != null && snap.eps > 0)) return false;
  if (filters.eps === "negative" && !(snap.eps != null && snap.eps < 0)) return false;
  if (filters.epsMin != null && (snap.eps == null || snap.eps < filters.epsMin)) return false;
  if (filters.epsMax != null && (snap.eps == null || snap.eps > filters.epsMax)) return false;

  return true;
}

function toRow(snap: SymbolSnapshot, reasons: ConditionResult[], trace: TraceNode | null): ResultRow {
  const m = (id: string) => metricValue(snap, id);
  return {
    symbol: snap.symbol,
    name: snap.name,
    exchange: snap.exchange,
    sector: snap.sector,
    industry: snap.industry,
    isEtf: snap.isEtf,
    price: m("close"),
    changePct: m("changePct"),
    volume: m("volume"),
    avgVolume: m("avgVol20"),
    relVolume: m("relVolume"),
    dollarVolume: m("dollarVol20"),
    marketCap: snap.marketCap,
    rsi2: m("rsi2"),
    rsi14: m("rsi14"),
    sma20: m("sma20"),
    sma50: m("sma50"),
    sma200: m("sma200"),
    distSma50: m("distSma50"),
    distSma200: m("distSma200"),
    pctFrom52High: m("pctFrom52High"),
    atrPct: m("atrPct"),
    adx: m("adx14"),
    mom20: m("mom20"),
    beta: snap.beta,
    peRatio: snap.peRatio,
    eps: snap.eps,
    dividendYield: snap.dividendYield,
    reasons,
    trace,
  };
}

const SORTABLE: Record<string, (r: ResultRow) => number | string | null> = {
  symbol: (r) => r.symbol,
  name: (r) => r.name,
  price: (r) => r.price,
  changePct: (r) => r.changePct,
  volume: (r) => r.volume,
  avgVolume: (r) => r.avgVolume,
  relVolume: (r) => r.relVolume,
  dollarVolume: (r) => r.dollarVolume,
  marketCap: (r) => r.marketCap,
  rsi2: (r) => r.rsi2,
  rsi14: (r) => r.rsi14,
  sma20: (r) => r.sma20,
  sma50: (r) => r.sma50,
  sma200: (r) => r.sma200,
  distSma50: (r) => r.distSma50,
  distSma200: (r) => r.distSma200,
  pctFrom52High: (r) => r.pctFrom52High,
  atrPct: (r) => r.atrPct,
  adx: (r) => r.adx,
  mom20: (r) => r.mom20,
  beta: (r) => r.beta,
  peRatio: (r) => r.peRatio,
  eps: (r) => r.eps,
  dividendYield: (r) => r.dividendYield,
  sector: (r) => r.sector,
};

export function sortRows(rows: ResultRow[], field: string, dir: "asc" | "desc"): ResultRow[] {
  const get = SORTABLE[field] ?? SORTABLE.marketCap;
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = get(a);
    const bv = get(b);
    // Nulls always sink, whichever direction the user is sorting.
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "string" || typeof bv === "string") {
      return String(av).localeCompare(String(bv)) * sign;
    }
    return (av - bv) * sign;
  });
}

/** Normalise anything arriving over the wire into a ScreenRequest. Fails closed. */
export function parseScreenRequest(body: unknown): ScreenRequest {
  const b = (body ?? {}) as Record<string, unknown>;
  const u = (b.universe ?? {}) as Record<string, unknown>;
  const f = (b.filters ?? {}) as Record<string, unknown>;
  const s = (b.sort ?? {}) as Record<string, unknown>;

  const scope = ["all", "nasdaq", "nyse", "amex", "etf", "watchlist"].includes(String(u.scope))
    ? (u.scope as UniverseSpec["scope"])
    : "all";

  const symbols = Array.isArray(u.symbols)
    ? u.symbols
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim().toUpperCase())
        .filter((x) => /^[A-Z.-]{1,6}$/.test(x))
        .slice(0, 2000)
    : undefined;

  const sectorList = Array.isArray(f.sectors)
    ? (f.sectors.filter((x): x is string => typeof x === "string") as Sector[])
    : undefined;

  const tiers = Array.isArray(f.marketCapTiers)
    ? f.marketCapTiers.filter((x): x is MarketCapTier => MARKET_CAP_TIERS.some((t) => t.id === x))
    : undefined;

  const rules = b.rules ? validateRuleNode(b.rules) : null;

  return {
    universe: {
      scope,
      includeEtfs: u.includeEtfs === true,
      excludePenny: u.excludePenny !== false,
      pennyThreshold: num(u.pennyThreshold) ?? 5,
      symbols,
    },
    filters: {
      priceMin: num(f.priceMin),
      priceMax: num(f.priceMax),
      marketCapTiers: tiers,
      marketCapMin: num(f.marketCapMin),
      marketCapMax: num(f.marketCapMax),
      volumeMin: num(f.volumeMin),
      avgVolumeMin: num(f.avgVolumeMin),
      dollarVolumeMin: num(f.dollarVolumeMin),
      sectors: sectorList,
      betaMin: num(f.betaMin),
      betaMax: num(f.betaMax),
      dividendYieldMin: num(f.dividendYieldMin),
      dividendYieldMax: num(f.dividendYieldMax),
      peMin: num(f.peMin),
      peMax: num(f.peMax),
      eps: ["any", "positive", "negative"].includes(String(f.eps)) ? (f.eps as BasicFilters["eps"]) : "any",
      epsMin: num(f.epsMin),
      epsMax: num(f.epsMax),
    },
    rules: rules && rules.kind === "group" ? (rules as RuleGroup) : null,
    sort: {
      field: typeof s.field === "string" && SORTABLE[s.field] ? s.field : "marketCap",
      dir: s.dir === "asc" ? "asc" : "desc",
    },
    limit: Math.max(1, Math.min(1000, num(b.limit) ?? 200)),
  };
}

export async function runScan(
  request: ScreenRequest,
  onProgress?: (done: number, total: number) => void
): Promise<ScanResponse> {
  const started = Date.now();
  const provider = getProvider();
  const isDemo = provider.id === "demo";

  const listings = allListings();
  const watchlist = request.universe.symbols?.length ? new Set(request.universe.symbols) : null;

  // Stage 1 - reference-only filtering. No network, no indicator maths.
  let eligible = listings
    .filter((l) => matchesUniverse(l, request.universe, watchlist))
    .filter((l) => passesReferenceFilters(l.symbol, request.filters));

  const eligibleCount = eligible.length;

  // Stage 2 - cap the work. When capping, keep the largest names so the sample
  // is the liquid end of the market rather than an alphabetical slice.
  const cap = scanCap(provider.id);
  let truncated = false;
  if (eligible.length > cap) {
    truncated = true;
    eligible = [...eligible]
      .sort((a, b) => (getProfile(b.symbol).marketCap ?? 0) - (getProfile(a.symbol).marketCap ?? 0))
      .slice(0, cap);
  }

  // Stage 3 - load price data and build snapshots (cached across scans).
  const { snapshots, missing } = await getSnapshots(
    eligible.map((l) => l.symbol),
    onProgress
  );

  // The demo provider derives beta / P/E / EPS from the same seed as its
  // prices, so those filters stay coherent with what the stock page shows.
  if (isDemo) {
    for (const snap of snapshots) {
      if (snap.beta == null) {
        const profile = getProfile(snap.symbol);
        snap.beta = demoBeta(snap.symbol, profile);
      }
    }
  }

  // Stage 4 - price filters, then the strategy rules.
  const rows: ResultRow[] = [];
  let latest = 0;
  for (const snap of snapshots) {
    if (snap.asOf > latest) latest = snap.asOf;
    if (!passesPriceFilters(snap, request.filters, request.universe)) continue;
    const evaluation = evaluateRules(snap, request.rules);
    if (!evaluation.passed) continue;
    rows.push(toRow(snap, evaluation.conditions, evaluation.trace));
  }

  const sorted = sortRows(rows, request.sort.field, request.sort.dir);

  return {
    rows: sorted.slice(0, request.limit),
    meta: {
      universeSize: listings.length,
      eligible: eligibleCount,
      scanned: snapshots.length,
      matches: rows.length,
      returned: Math.min(rows.length, request.limit),
      noData: missing.length,
      truncated,
      elapsedMs: Date.now() - started,
      freshness: { ...provider.freshness, asOf: latest || null },
    },
  };
}
