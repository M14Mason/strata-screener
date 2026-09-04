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
const REJECT_NAME = /\b(warrant|right|unit|preferred|depositary share|debenture|note[s]? due|subordinated|trust certificate|contingent value)\b/i;

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
  if (!/^[A-Z]{1,5}$/.test(symbol)) continue;
  if (REJECT_NAME.test(name)) continue;
  rows.set(symbol, { s: symbol, n: cleanName(name), x: "NASDAQ", e: etf === "Y" ? 1 : 0 });
}

const other = await text(OTHER);
for (const line of other.split("\n").slice(1)) {
  const f = line.split("|");
  if (f.length < 8) continue;
  const [actSymbol, name, exch, , etf, , testIssue] = f;
  if (testIssue === "Y") continue;
  if (!/^[A-Z]{1,5}$/.test(actSymbol)) continue;
  if (REJECT_NAME.test(name)) continue;
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
