/**
 * Builds data/eod-bundle.bin -- the prebuilt end-of-day dataset the hosted app
 * serves every request from.
 *
 * Why this exists: a screener has to look at the whole market at once, and no
 * free market-data API will survive thousands of calls per page load. Screening
 * is an end-of-day activity anyway, so one scheduled job a day produces a
 * dataset and the app then answers every scan with no network access at all.
 * That is what makes a hosted deployment both fast and free.
 *
 * Sources:
 *   nasdaq  (default) Nasdaq's public historical-prices endpoint. No API key.
 *   polygon           Polygon.io grouped-daily. Needs POLYGON_API_KEY, but
 *                     returns a whole session per request, so it is far cheaper
 *                     in requests if you have a key.
 *
 * Usage:
 *   npx tsx scripts/build-bundle.mts [--sessions 320] [--max-symbols 0]
 *                                    [--source nasdaq|polygon] [--etfs]
 */
import fs from "node:fs";
import path from "node:path";
import { allListings } from "../src/lib/data/reference";
import { encodeBundle, VOLUME_SCALE } from "../src/lib/data/bundle-format";
import { fetchNasdaqBars } from "../src/lib/data/nasdaq";
import type { Bar } from "../src/lib/data/types";

const DAY_MS = 86_400_000;

const numArg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
};
const strArg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const flag = (name: string) => process.argv.includes(`--${name}`);

const SESSIONS = numArg("sessions", 320);
// Milliseconds between requests per worker. Nasdaq's edge blocks an IP after a
// few hundred rapid requests, and the block lasts far longer than it takes to
// trigger, so the default pace is deliberately slow. Measured: concurrency 10
// with no delay is blocked after ~225 requests.
const DELAY_MS = numArg("delay", Number(process.env.BUNDLE_DELAY_MS || 900));
const MAX_SYMBOLS = numArg("max-symbols", 0); // 0 = every listing
const SOURCE = strArg("source", process.env.BUNDLE_SOURCE || "nasdaq");
const INCLUDE_ETFS = flag("etfs") || process.env.BUNDLE_INCLUDE_ETFS === "1";
const CONCURRENCY = numArg("concurrency", Number(process.env.PROVIDER_CONCURRENCY || 8));
const OUT = process.env.EOD_BUNDLE_PATH || "data/eod-bundle.bin";

// A symbol needs enough history for the long-period indicators to mean
// anything; below this almost every screen would read null.
const MIN_SESSIONS = 60;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// ---------------------------------------------------------------- selection

let listings = allListings().filter((l) => INCLUDE_ETFS || !l.isEtf);

if (MAX_SYMBOLS > 0 && listings.length > MAX_SYMBOLS) {
  // Keep the largest names, so a capped dataset is the liquid end of the
  // market rather than an alphabetical slice.
  const { getProfile } = await import("../src/lib/data/reference");
  listings = [...listings]
    .sort((a, b) => (getProfile(b.symbol).marketCap ?? 0) - (getProfile(a.symbol).marketCap ?? 0))
    .slice(0, MAX_SYMBOLS);
  console.log(`Capped to the ${MAX_SYMBOLS} largest listings by market cap.`);
}

console.log(
  `Building dataset: ${listings.length.toLocaleString()} listings, ${SESSIONS} sessions, ` +
    `source=${SOURCE}, ETFs=${INCLUDE_ETFS ? "included" : "excluded"}`
);

// ------------------------------------------------------------------ fetch

const barsBySymbol = new Map<string, Bar[]>();
let done = 0;
let failed = 0;
let blockedStreak = 0;
const started = Date.now();

/**
 * Per-symbol cache on disk, so a run that is interrupted -- or blocked partway
 * -- can be restarted and pick up where it stopped instead of refetching
 * everything. Bars for a past session never change.
 */
const SYMBOL_CACHE = path.resolve(process.cwd(), ".cache", "nasdaq-bars");
const cacheKeyFor = (symbol: string) =>
  path.join(SYMBOL_CACHE, `${symbol.replace(/[^A-Z0-9.]/gi, "_")}.json`);

function readCached(symbol: string): Bar[] | null {
  try {
    const raw = JSON.parse(fs.readFileSync(cacheKeyFor(symbol), "utf8")) as { asOf: number; bars: Bar[] };
    // Only reuse a cache entry from the current session's data.
    if (raw.asOf >= todayCutoff) return raw.bars;
  } catch {
    /* miss */
  }
  return null;
}

function writeCached(symbol: string, bars: Bar[]) {
  try {
    fs.mkdirSync(SYMBOL_CACHE, { recursive: true });
    fs.writeFileSync(cacheKeyFor(symbol), JSON.stringify({ asOf: bars[bars.length - 1]?.t ?? 0, bars }));
  } catch {
    /* the cache is an optimisation, never a requirement */
  }
}

// Cache entries are good if their newest bar is from the last few days.
const todayCutoff = Date.now() - 5 * DAY_MS;

class BlockedError extends Error {}

async function fetchNasdaq() {
  let cursor = 0;
  let aborted = false;

  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < listings.length && !aborted) {
      const listing = listings[cursor++];

      const cached = readCached(listing.symbol);
      if (cached) {
        if (cached.length >= MIN_SESSIONS) barsBySymbol.set(listing.symbol, cached);
        done++;
        continue;
      }

      try {
        const bars = await fetchNasdaqBars(listing.symbol, SESSIONS);
        if (bars.length) {
          writeCached(listing.symbol, bars);
          blockedStreak = 0;
          if (bars.length >= MIN_SESSIONS) barsBySymbol.set(listing.symbol, bars);
        }
      } catch (error) {
        failed++;
        const message = error instanceof Error ? error.message : "";
        // A 403 is the edge blocking this IP, not a property of the symbol.
        // Carrying on would burn thousands of requests against a closed door
        // and produce a dataset full of holes, so a sustained streak aborts.
        if (/HTTP 403|rejected the request/i.test(message)) {
          blockedStreak++;
          if (blockedStreak >= 25) {
            aborted = true;
            throw new BlockedError(
              `Nasdaq blocked this IP after ${done} requests (${barsBySymbol.size} symbols collected). ` +
                `Progress is cached under .cache/nasdaq-bars, so re-running later resumes from here. ` +
                `Raise --delay or lower --concurrency to stay under the limit.`
            );
          }
        }
      }

      done++;
      if (done % 100 === 0) {
        const rate = done / ((Date.now() - started) / 1000);
        const eta = Math.round((listings.length - done) / Math.max(rate, 0.01));
        console.log(
          `  ${done}/${listings.length}  kept ${barsBySymbol.size}  failed ${failed}  ` +
            `${rate.toFixed(1)}/s  eta ${Math.floor(eta / 60)}m${String(eta % 60).padStart(2, "0")}s`
        );
      }

      if (DELAY_MS > 0) await sleep(DELAY_MS);
    }
  });

  const results = await Promise.allSettled(workers);
  const blocked = results.find((r) => r.status === "rejected" && r.reason instanceof BlockedError);
  if (blocked && blocked.status === "rejected") {
    console.warn(`\n  ! ${blocked.reason.message}\n`);
  }
}

async function fetchPolygon() {
  const key = process.env.POLYGON_API_KEY;
  if (!key) throw new Error("--source polygon needs POLYGON_API_KEY. Omit --source to use Nasdaq, which needs no key.");
  const rate = Number(process.env.POLYGON_RATE_LIMIT ?? 5);
  const stamps: number[] = [];
  const throttle = async () => {
    if (rate <= 0) return;
    for (;;) {
      const now = Date.now();
      while (stamps.length && now - stamps[0] > 60_000) stamps.shift();
      if (stamps.length < rate) return void stamps.push(now);
      await sleep(60_000 - (now - stamps[0]) + 50);
    }
  };

  const wanted = new Set(listings.map((l) => l.symbol));
  const cacheDir = path.resolve(process.cwd(), ".cache", "grouped");
  const dates: string[] = [];
  let cursor = Date.now();
  while (dates.length < SESSIONS * 1.6 + 40) {
    const d = new Date(cursor).getUTCDay();
    if (d !== 0 && d !== 6) dates.push(ymd(cursor));
    cursor -= DAY_MS;
  }

  let sessions = 0;
  for (const date of dates) {
    if (sessions >= SESSIONS) break;
    const cacheFile = path.join(cacheDir, `${date}.json`);
    let rows: Array<{ T: string; o: number; h: number; l: number; c: number; v: number; t: number }> | null = null;
    if (fs.existsSync(cacheFile)) {
      try { rows = JSON.parse(fs.readFileSync(cacheFile, "utf8")); } catch { rows = null; }
    }
    if (!rows) {
      await throttle();
      const res = await fetch(
        `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${date}?adjusted=true&apiKey=${key}`,
        { signal: AbortSignal.timeout(30_000) }
      );
      if (res.status === 429) { await sleep(15_000); continue; }
      if (!res.ok) throw new Error(`Polygon returned HTTP ${res.status} for ${date}.`);
      rows = ((await res.json()) as { results?: typeof rows }).results ?? [];
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify(rows));
    }
    if (!rows.length) continue; // holiday
    sessions++;
    for (const r of rows) {
      if (!wanted.has(r.T)) continue;
      const list = barsBySymbol.get(r.T) ?? [];
      list.push({ t: r.t, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v });
      barsBySymbol.set(r.T, list);
    }
    if (sessions % 20 === 0) console.log(`  ${sessions}/${SESSIONS} sessions`);
  }
  for (const bars of barsBySymbol.values()) bars.sort((a, b) => a.t - b.t);
  for (const [sym, bars] of barsBySymbol) if (bars.length < MIN_SESSIONS) barsBySymbol.delete(sym);
}

if (SOURCE === "polygon") await fetchPolygon();
else await fetchNasdaq();

if (barsBySymbol.size === 0) throw new Error("No symbols returned usable history — refusing to write an empty dataset.");

// ------------------------------------------------------------------ pack

// The session axis is the union of every date seen, so a symbol that did not
// trade on some day simply has a gap rather than shifting the whole series.
const allDates = new Set<number>();
for (const bars of barsBySymbol.values()) for (const b of bars) allDates.add(b.t);
const dates = [...allDates].sort((a, b) => a - b).slice(-SESSIONS);
const dateIndex = new Map(dates.map((d, i) => [d, i]));

const symbols = [...barsBySymbol.keys()].sort();
const S = dates.length;
const N = symbols.length;

const alloc = () => {
  const a = new Float32Array(N * S);
  a.fill(NaN); // NaN = "did not trade this session"
  return a;
};
const open = alloc(), high = alloc(), low = alloc(), close = alloc(), volume = alloc();

for (let i = 0; i < N; i++) {
  const bars = barsBySymbol.get(symbols[i])!;
  for (const b of bars) {
    const j = dateIndex.get(b.t);
    if (j === undefined) continue;
    const at = i * S + j;
    open[at] = b.o; high[at] = b.h; low[at] = b.l; close[at] = b.c;
    volume[at] = b.v / VOLUME_SCALE;
  }
}

const bytes = encodeBundle({ asOf: dates[dates.length - 1], dates, names: symbols, open, high, low, close, volume });
const outPath = path.resolve(process.cwd(), OUT);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, bytes);

const mins = ((Date.now() - started) / 60_000).toFixed(1);
console.log(
  `\nWrote ${OUT}\n` +
    `  ${N.toLocaleString()} symbols x ${S} sessions\n` +
    `  ${(bytes.length / 1e6).toFixed(1)} MB\n` +
    `  latest session ${ymd(dates[dates.length - 1])}\n` +
    `  ${failed} symbols failed, ${listings.length - N} of ${listings.length} not included\n` +
    `  took ${mins} minutes`
);
