/**
 * Builds src/data/universe.json from the public NASDAQ Trader symbol directory.
 *   https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt
 *   https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt
 * Both files are published by Nasdaq for public use and contain no prices --
 * only listing metadata (symbol, security name, exchange, ETF flag).
 *
 * Run:  node scripts/build-universe.mjs
 */
import fs from "node:fs";
import path from "node:path";

const NASDAQ = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt";
const OTHER = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt";

const EXCHANGE_CODE = { A: "AMEX", N: "NYSE", P: "NYSE", Z: "NYSE", V: "NYSE", Q: "NASDAQ" };

// Names that indicate a non-common-stock instrument we do not want in the
// default universe (warrants, rights, units, preferreds, notes, trust certs).
//
// Plurals matter: an earlier version matched "warrant" but not "Warrants", so
// every plural-named warrant slipped through the name filter.
const REJECT_NAME =
  /\b(warrants?|rights?|units?|preferred|depositary shares?|debentures?|notes? due|subordinated|trust certificates?|contingent value)\b/i;

// Symbols are accepted as either a plain ticker or a dotted class share
// (BRK.B, BF.A). Dotted symbols were previously dropped outright, which lost
// ~20 real common stocks including both Berkshire classes.
const SYMBOL_OK = /^[A-Z]{1,5}(\.[A-Z])?$/;

// In the NASDAQ Trader convention the letter after the dot encodes the
// instrument for non-equity issues: W warrants, R rights, U units, P preferred.
// Those are structurally excluded regardless of how the name is written.
const REJECT_SUFFIX = /\.(W|R|U|P)$/;

function acceptSymbol(symbol, name) {
  if (!SYMBOL_OK.test(symbol)) return false;
  if (REJECT_SUFFIX.test(symbol)) return false;
  if (REJECT_NAME.test(name)) return false;
  return true;
}

async function text(url) {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.text();
}

function cleanName(raw) {
  return raw
    .replace(/\s*-\s*(Common Stock|Class [A-Z] Common Stock|Ordinary Shares.*|American Depositary Shares.*|Common Shares.*)$/i, "")
    .replace(/\s*(Common Stock|Ordinary Shares|Common Shares)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

const rows = new Map();

const nasdaq = await text(NASDAQ);
for (const line of nasdaq.split("\n").slice(1)) {
  const f = line.split("|");
  if (f.length < 8) continue;
  const [symbol, name, , testIssue, , , etf] = f;
  if (testIssue === "Y") continue;
  if (!acceptSymbol(symbol, name)) continue;
  rows.set(symbol, { s: symbol, n: cleanName(name), x: "NASDAQ", e: etf === "Y" ? 1 : 0 });
}

const other = await text(OTHER);
for (const line of other.split("\n").slice(1)) {
  const f = line.split("|");
  if (f.length < 8) continue;
  const [actSymbol, name, exch, , etf, , testIssue] = f;
  if (testIssue === "Y") continue;
  if (!acceptSymbol(actSymbol, name)) continue;
  const x = EXCHANGE_CODE[exch];
  if (!x) continue;
  if (rows.has(actSymbol)) continue;
  rows.set(actSymbol, { s: actSymbol, n: cleanName(name), x, e: etf === "Y" ? 1 : 0 });
}

const out = [...rows.values()].sort((a, b) => (a.s < b.s ? -1 : 1));
const dir = path.join(process.cwd(), "src", "data");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(
  path.join(dir, "universe.json"),
  JSON.stringify({ builtAt: new Date().toISOString(), rows: out.map((r) => [r.s, r.n, r.x, r.e]) })
);

const stocks = out.filter((r) => !r.e).length;
console.log(`universe.json: ${out.length} listings (${stocks} stocks, ${out.length - stocks} ETFs)`);
for (const x of ["NASDAQ", "NYSE", "AMEX"]) console.log(` ${x}: ${out.filter((r) => r.x === x).length}`);
