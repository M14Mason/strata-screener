/**
 * Builds src/data/profiles.json -- reference (non-price) metadata for the US
 * universe: sector, industry, market cap, country, IPO year.
 *
 * Source: Nasdaq's public stock-screener download endpoint, which covers all
 * three US exchanges. This is slow-moving reference data, not a price feed;
 * live prices always come from the configured MarketDataProvider.
 *
 * The endpoint also returns a last-sale price. It is deliberately NOT stored:
 * a real quote sitting in a bundled file could end up rendered next to
 * synthetic demo data, and a price captured at build time is stale the moment
 * it is written.
 *
 * Run:  node scripts/build-profiles.mjs
 */
import fs from "node:fs";
import path from "node:path";

const EXCHANGES = ["NASDAQ", "NYSE", "AMEX"];

// Nasdaq's sector vocabulary -> the 10 buckets the screener exposes.
const SECTOR_MAP = {
  Technology: "Technology",
  "Health Care": "Healthcare",
  Finance: "Financials",
  Energy: "Energy",
  Industrials: "Industrials",
  "Consumer Discretionary": "Consumer",
  "Consumer Staples": "Consumer",
  Telecommunications: "Communication",
  "Utilities": "Utilities",
  "Real Estate": "Real Estate",
  "Basic Materials": "Materials",
  Miscellaneous: "Miscellaneous",
};

const num = (v) => {
  if (v == null) return null;
  const text = String(v).replace(/[$,%\s,]/g, "");
  if (text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

// Nasdaq uses "0" for "no IPO year on file"; a year of 0 is worse than no year.
const year = (v) => {
  const n = num(v);
  return n && n > 1800 ? n : null;
};

const out = {};
for (const exch of EXCHANGES) {
  const url = `https://api.nasdaq.com/api/screener/stocks?tableonly=false&download=true&exchange=${exch}`;
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0", accept: "application/json" } });
  if (!res.ok) throw new Error(`${exch} -> ${res.status}`);
  const json = await res.json();
  const rows = json?.data?.rows ?? json?.data?.table?.rows ?? [];
  for (const r of rows) {
    const s = String(r.symbol || "").trim().toUpperCase();
    if (!/^[A-Z]{1,5}$/.test(s)) continue;
    if (out[s]) continue;
    out[s] = {
      sector: SECTOR_MAP[r.sector] ?? (r.sector ? "Miscellaneous" : null),
      industry: r.industry || null,
      marketCap: num(r.marketCap) || null,
      country: r.country || null,
      ipoYear: year(r.ipoyear),
    };
  }
  console.log(`${exch}: ${rows.length} rows`);
}

const dir = path.join(process.cwd(), "src", "data");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(
  path.join(dir, "profiles.json"),
  JSON.stringify({ builtAt: new Date().toISOString(), profiles: out })
);

const withSector = Object.values(out).filter((p) => p.sector).length;
const withCap = Object.values(out).filter((p) => p.marketCap).length;
console.log(`profiles.json: ${Object.keys(out).length} symbols, ${withSector} with sector, ${withCap} with market cap`);
