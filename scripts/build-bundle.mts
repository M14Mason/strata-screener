/**
 * Builds data/eod-bundle.bin — the prebuilt end-of-day dataset the hosted app
 * serves every request from.
 *
 * Why this exists: a screener has to look at the whole market at once, and no
 * free market-data API will let a web server make thousands of calls per page
 * load. Screening is an end-of-day activity anyway, so one scheduled job a day
 * produces a dataset, and the app then answers every scan with zero network
 * access. That is what makes a hosted deployment both fast and free.
 *
 * Source: Polygon.io's grouped-daily endpoint, which returns every US ticker
 * for one session in a single request. Building 320 sessions therefore costs
 * ~320 requests total, not 320 x 6,000.
 *
 * Usage:
 *   POLYGON_API_KEY=xxx npx tsx scripts/build-bundle.mts [--sessions 320] [--max-symbols 0]
 *
 * Past sessions never change, so each day's response is cached under .cache/.
 * A daily re-run costs one new request.
 */
import fs from "node:fs";
import path from "node:path";
import { allListings } from "../src/lib/data/reference";
import { encodeBundle, VOLUME_SCALE } from "../src/lib/data/bundle-format";

const DAY_MS = 86_400_000;
const BASE = "https://api.polygon.io";

const argOf = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
};

const SESSIONS = argOf("sessions", 320);
// 0 = every listing. Lower it to shrink the file for a constrained host.
const MAX_SYMBOLS = argOf("max-symbols", 0);
const OUT = process.env.EOD_BUNDLE_PATH || "data/eod-bundle.bin";
const CACHE_DIR = path.resolve(process.cwd(), ".cache", "grouped");

const key = process.env.POLYGON_API_KEY;
if (!key) {
  console.error(
    "POLYGON_API_KEY is not set.\n\n" +
      "Get a free key at https://polygon.io/dashboard/signup — the free tier covers\n" +
      "end-of-day data and the grouped-daily endpoint this script uses.\n"
  );
  process.exit(1);
}

// Polygon's free tier allows 5 requests a minute. Staying under it is far
// cheaper than getting the key throttled.
const RATE_LIMIT = Number(process.env.POLYGON_RATE_LIMIT ?? 5);
const requestTimes: number[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function throttle() {
  if (RATE_LIMIT <= 0) return;
  for (;;) {
    const now = Date.now();
    while (requestTimes.length && now - requestTimes[0] > 60_000) requestTimes.shift();
    if (requestTimes.length < RATE_LIMIT) {
      requestTimes.push(now);
      return;
    }
    await sleep(60_000 - (now - requestTimes[0]) + 50);
  }
}

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

interface GroupedRow {
  T: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

async function grouped(date: string): Promise<GroupedRow[] | null> {
  const cacheFile = path.join(CACHE_DIR, `${date}.json`);
  if (fs.existsSync(cacheFile)) {
    try {
      return JSON.parse(fs.readFileSync(cacheFile, "utf8")) as GroupedRow[];
    } catch {
      // Corrupt cache entry: fall through and refetch.
    }
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    await throttle();
    const res = await fetch(
      `${BASE}/v2/aggs/grouped/locale/us/market/stocks/${date}?adjusted=true&apiKey=${key}`,
      { signal: AbortSignal.timeout(30_000) }
    );
    if (res.status === 429) {
      await sleep(15_000);
      continue;
    }
    if (res.status === 403 || res.status === 401) {
      throw new Error(
        `Polygon rejected the key (HTTP ${res.status}). Check POLYGON_API_KEY, and that your plan covers historical aggregates.`
      );
    }
    if (!res.ok) {
      if (attempt === 3) throw new Error(`Polygon returned HTTP ${res.status} for ${date}.`);
      await sleep(2000 * (attempt + 1));
      continue;
    }
    const json = (await res.json()) as { results?: GroupedRow[] };
    const rows = json.results ?? [];
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(rows));
    return rows;
  }
  return null;
}

// ---------------------------------------------------------------- main

// Walk back over weekdays. Market holidays come back empty and are dropped, so
// we keep going until we have SESSIONS days that actually traded.
const candidates: string[] = [];
let cursor = Date.now();
while (candidates.length < SESSIONS * 1.6 + 40) {
  const day = new Date(cursor).getUTCDay();
  if (day !== 0 && day !== 6) candidates.push(ymd(cursor));
  cursor -= DAY_MS;
}

console.log(`Fetching up to ${candidates.length} candidate sessions (target ${SESSIONS} trading days)…`);
if (RATE_LIMIT > 0) {
  console.log(`Rate limit ${RATE_LIMIT}/min. Uncached days will take roughly ${Math.ceil(SESSIONS / RATE_LIMIT)} minutes.`);
}

const sessions: Array<{ date: string; rows: GroupedRow[] }> = [];
for (const date of candidates) {
  if (sessions.length >= SESSIONS) break;
  const rows = await grouped(date);
  if (!rows || rows.length === 0) continue; // holiday or not yet published
  sessions.push({ date, rows });
  if (sessions.length % 20 === 0) console.log(`  ${sessions.length}/${SESSIONS} sessions`);
}

if (sessions.length === 0) throw new Error("Polygon returned no sessions at all — check the API key and plan.");
sessions.reverse(); // oldest first

// Restrict to listings we know about, so the dataset lines up with the
// reference layer the screener filters on.
const known = new Map(allListings().map((l) => [l.symbol, l]));
const traded = new Map<string, number>();
for (const s of sessions) {
  for (const r of s.rows) {
    if (!known.has(r.T)) continue;
    traded.set(r.T, (traded.get(r.T) ?? 0) + 1);
  }
}

// A symbol needs enough history for the long-period indicators to mean
// anything; below ~60 sessions almost every screen would read null.
let symbols = [...traded.entries()]
  .filter(([, n]) => n >= Math.min(60, sessions.length))
  .map(([s]) => s)
  .sort();

if (MAX_SYMBOLS > 0 && symbols.length > MAX_SYMBOLS) {
  const liquidity = new Map<string, number>();
  for (const s of sessions.slice(-20)) {
    for (const r of s.rows) {
      if (!traded.has(r.T)) continue;
      liquidity.set(r.T, (liquidity.get(r.T) ?? 0) + r.c * r.v);
    }
  }
  symbols = symbols.sort((a, b) => (liquidity.get(b) ?? 0) - (liquidity.get(a) ?? 0)).slice(0, MAX_SYMBOLS).sort();
  console.log(`Capped to the ${MAX_SYMBOLS} most liquid symbols.`);
}

const S = sessions.length;
const N = symbols.length;
const row = new Map(symbols.map((s, i) => [s, i]));

const alloc = () => {
  const a = new Float32Array(N * S);
  a.fill(NaN); // NaN = "did not trade this session"
  return a;
};
const open = alloc();
const high = alloc();
const low = alloc();
const close = alloc();
const volume = alloc();

for (let i = 0; i < S; i++) {
  for (const r of sessions[i].rows) {
    const idx = row.get(r.T);
    if (idx === undefined) continue;
    const at = idx * S + i;
    open[at] = r.o;
    high[at] = r.h;
    low[at] = r.l;
    close[at] = r.c;
    volume[at] = r.v / VOLUME_SCALE;
  }
}

const dates = sessions.map((s) => Date.parse(`${s.date}T00:00:00Z`));
const bytes = encodeBundle({ asOf: dates[dates.length - 1], dates, names: symbols, open, high, low, close, volume });

fs.mkdirSync(path.dirname(path.resolve(process.cwd(), OUT)), { recursive: true });
fs.writeFileSync(path.resolve(process.cwd(), OUT), bytes);

console.log(
  `\nWrote ${OUT}\n` +
    `  ${N.toLocaleString()} symbols x ${S} sessions\n` +
    `  ${(bytes.length / 1e6).toFixed(1)} MB\n` +
    `  latest session ${sessions[S - 1].date}`
);
