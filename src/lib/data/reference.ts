import "server-only";
import universeJson from "@/data/universe.json";
import profilesJson from "@/data/profiles.json";
import type { Exchange, Listing, Profile, Sector } from "./types";

/**
 * The bundled reference layer: which symbols exist, and the slow-moving facts
 * about them (sector, industry, market cap). Regenerate with
 *   node scripts/build-universe.mjs && node scripts/build-profiles.mjs
 *
 * Kept separate from price data so a provider only has to supply prices.
 */

type RawRow = [string, string, string, number];

const listings: Listing[] = (universeJson.rows as RawRow[]).map(([symbol, name, exchange, etf]) => ({
  symbol,
  name,
  exchange: exchange as Exchange,
  isEtf: etf === 1,
}));

const bySymbol = new Map(listings.map((l) => [l.symbol, l]));

const rawProfiles = profilesJson.profiles as Record<
  string,
  { sector: string | null; industry: string | null; marketCap: number | null; country: string | null; ipoYear: number | null }
>;

const profiles = new Map<string, Profile>(
  Object.entries(rawProfiles).map(([symbol, p]) => [
    symbol,
    {
      sector: (p.sector as Sector) ?? null,
      industry: p.industry,
      marketCap: p.marketCap,
      country: p.country,
      ipoYear: p.ipoYear,
    },
  ])
);

export const REFERENCE_BUILT_AT = universeJson.builtAt as string;
export const PROFILES_BUILT_AT = profilesJson.builtAt as string;

export function allListings(): Listing[] {
  return listings;
}

export function getListing(symbol: string): Listing | undefined {
  return bySymbol.get(symbol.toUpperCase());
}

export function getProfile(symbol: string): Profile {
  return (
    profiles.get(symbol.toUpperCase()) ?? {
      sector: null,
      industry: null,
      marketCap: null,
      country: null,
      ipoYear: null,
    }
  );
}

export function getProfiles(symbols: string[]): Record<string, Profile> {
  const out: Record<string, Profile> = {};
  for (const s of symbols) out[s] = getProfile(s);
  return out;
}

/** Symbol search used by the header search box and watchlist "add" flow. */
export function searchListings(query: string, limit = 20): Listing[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const exact: Listing[] = [];
  const prefix: Listing[] = [];
  const nameHit: Listing[] = [];
  for (const l of listings) {
    if (l.symbol === q) exact.push(l);
    else if (l.symbol.startsWith(q)) prefix.push(l);
    else if (nameHit.length < limit && l.name.toUpperCase().includes(q)) nameHit.push(l);
    if (exact.length + prefix.length >= limit) break;
  }
  return [...exact, ...prefix, ...nameHit].slice(0, limit);
}
