import type { Sector } from "@/lib/data/types";
import type { RuleGroup } from "./rules";

/**
 * The non-technical half of a screen: universe selection plus the basic
 * price / size / liquidity / fundamental filters. Every field is optional --
 * an empty object means "no restriction".
 *
 * Client-safe: this module is shared by the filter panel and the scan API so
 * there is one definition of what a screen is.
 */

export type MarketCapTier = "micro" | "small" | "mid" | "large" | "mega";

export const MARKET_CAP_TIERS: Array<{ id: MarketCapTier; label: string; min: number; max: number | null; hint: string }> = [
  { id: "micro", label: "Micro", min: 0, max: 300e6, hint: "under $300M" },
  { id: "small", label: "Small", min: 300e6, max: 2e9, hint: "$300M – $2B" },
  { id: "mid", label: "Mid", min: 2e9, max: 10e9, hint: "$2B – $10B" },
  { id: "large", label: "Large", min: 10e9, max: 200e9, hint: "$10B – $200B" },
  { id: "mega", label: "Mega", min: 200e9, max: null, hint: "over $200B" },
];

export type EpsFilter = "any" | "positive" | "negative";

export interface BasicFilters {
  priceMin?: number;
  priceMax?: number;
  marketCapTiers?: MarketCapTier[];
  marketCapMin?: number;
  marketCapMax?: number;
  volumeMin?: number;
  avgVolumeMin?: number;
  dollarVolumeMin?: number;
  sectors?: Sector[];
  betaMin?: number;
  betaMax?: number;
  dividendYieldMin?: number;
  dividendYieldMax?: number;
  peMin?: number;
  peMax?: number;
  eps?: EpsFilter;
  epsMin?: number;
  epsMax?: number;
}

export type UniverseScope = "all" | "nasdaq" | "nyse" | "amex" | "etf" | "watchlist";

export const UNIVERSE_OPTIONS: Array<{ id: UniverseScope; label: string; hint: string }> = [
  { id: "all", label: "All U.S. stocks", hint: "NYSE, NASDAQ and AMEX common stocks" },
  { id: "nasdaq", label: "NASDAQ", hint: "NASDAQ-listed only" },
  { id: "nyse", label: "NYSE", hint: "NYSE-listed only" },
  { id: "amex", label: "AMEX", hint: "NYSE American only" },
  { id: "etf", label: "ETFs", hint: "Exchange-traded funds only" },
  { id: "watchlist", label: "My watchlist", hint: "Only symbols on a watchlist you pick" },
];

export interface UniverseSpec {
  scope: UniverseScope;
  /** Fold ETFs into a stock scope. Ignored when scope is already "etf". */
  includeEtfs: boolean;
  /** Drop anything trading below `pennyThreshold`. On by default. */
  excludePenny: boolean;
  pennyThreshold: number;
  /** Symbols for the "watchlist" scope. */
  symbols?: string[];
}

export const DEFAULT_UNIVERSE: UniverseSpec = {
  scope: "all",
  includeEtfs: false,
  excludePenny: true,
  pennyThreshold: 5,
};

export interface SortSpec {
  /** A results-table column id. */
  field: string;
  dir: "asc" | "desc";
}

export interface ScreenRequest {
  universe: UniverseSpec;
  filters: BasicFilters;
  rules: RuleGroup | null;
  sort: SortSpec;
  limit: number;
}

export const DEFAULT_SORT: SortSpec = { field: "marketCap", dir: "desc" };

export function emptyScreen(): ScreenRequest {
  return {
    universe: { ...DEFAULT_UNIVERSE },
    filters: {},
    rules: null,
    sort: { ...DEFAULT_SORT },
    limit: 200,
  };
}

/** How many basic filters are actually doing something - shown as a badge. */
export function countActiveFilters(f: BasicFilters): number {
  let n = 0;
  const has = (v: unknown) => v !== undefined && v !== null && v !== "";
  if (has(f.priceMin) || has(f.priceMax)) n++;
  if (f.marketCapTiers?.length || has(f.marketCapMin) || has(f.marketCapMax)) n++;
  if (has(f.volumeMin) || has(f.avgVolumeMin) || has(f.dollarVolumeMin)) n++;
  if (f.sectors?.length) n++;
  if (has(f.betaMin) || has(f.betaMax)) n++;
  if (has(f.dividendYieldMin) || has(f.dividendYieldMax)) n++;
  if (has(f.peMin) || has(f.peMax)) n++;
  if ((f.eps && f.eps !== "any") || has(f.epsMin) || has(f.epsMax)) n++;
  return n;
}
