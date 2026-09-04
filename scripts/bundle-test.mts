/** Round-trips the dataset format through encode -> file -> BundleProvider. */
process.env.MARKET_DATA_PROVIDER = "demo";
process.env.EOD_BUNDLE_PATH = ".cache/test-bundle.bin";
import fs from "node:fs";
import { DemoProvider } from "../src/lib/data/demo";
import { encodeBundle, VOLUME_SCALE } from "../src/lib/data/bundle-format";
import { BundleProvider, resetBundle, bundleStatus } from "../src/lib/data/bundle";
import { allListings } from "../src/lib/data/reference";

let bad = 0;
const check = (label: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);
  if (!ok) bad++;
};

const demo = new DemoProvider();
const symbols = allListings().filter((l) => !l.isEtf).slice(0, 400).map((l) => l.symbol);
const S = 320;

// Build source bars, then deliberately punch holes so the NaN path is covered.
const barsBySymbol = new Map<string, Awaited<ReturnType<typeof demo.getHistoricalPrices>>>();
for (const s of symbols) barsBySymbol.set(s, await demo.getHistoricalPrices(s, S));

const dates = barsBySymbol.get(symbols[0])!.map((b) => b.t);
const N = symbols.length;
const alloc = () => { const a = new Float32Array(N * S); a.fill(NaN); return a; };
const open = alloc(), high = alloc(), low = alloc(), close = alloc(), volume = alloc();
const dateIndex = new Map(dates.map((d, i) => [d, i]));

const HOLE_SYMBOL = symbols[3];
const HOLE_AT = 100;
for (let i = 0; i < N; i++) {
  const bars = barsBySymbol.get(symbols[i])!;
  for (const b of bars) {
    const j = dateIndex.get(b.t);
    if (j === undefined) continue;
    if (symbols[i] === HOLE_SYMBOL && j === HOLE_AT) continue; // leave a gap
    const at = i * S + j;
    open[at] = b.o; high[at] = b.h; low[at] = b.l; close[at] = b.c; volume[at] = b.v / VOLUME_SCALE;
  }
}

const bytes = encodeBundle({ asOf: dates.at(-1)!, dates, names: symbols, open, high, low, close, volume });
fs.mkdirSync(".cache", { recursive: true });
fs.writeFileSync(".cache/test-bundle.bin", bytes);
resetBundle();

const status = bundleStatus();
check("bundle is detected on disk", status.present && status.symbols === N && status.sessions === S,
  `${status.symbols} symbols x ${status.sessions} sessions, ${(status.sizeBytes! / 1e6).toFixed(1)}MB`);
check("asOf matches the last session", status.asOf === dates.at(-1));

const provider = new BundleProvider();

// Prices must survive the f32 round trip to cent accuracy.
let worstPrice = 0, worstVol = 0;
for (const s of symbols.slice(0, 60)) {
  const src = barsBySymbol.get(s)!;
  const got = await provider.getHistoricalPrices(s, S);
  const expected = s === HOLE_SYMBOL ? src.length - 1 : src.length;
  if (got.length !== expected) { check(`bar count for ${s}`, false, `${got.length} vs ${expected}`); break; }
  const byT = new Map(got.map((b) => [b.t, b]));
  for (const b of src) {
    const g = byT.get(b.t);
    if (!g) continue;
    worstPrice = Math.max(worstPrice, Math.abs(g.c - b.c), Math.abs(g.o - b.o), Math.abs(g.h - b.h), Math.abs(g.l - b.l));
    worstVol = Math.max(worstVol, Math.abs(g.v - b.v) / Math.max(1, b.v));
  }
}
check("prices round-trip within a hundredth of a cent", worstPrice < 0.005, `worst=$${worstPrice.toFixed(6)}`);
check("volume round-trips within 0.01%", worstVol < 1e-4, `worst=${(worstVol * 100).toFixed(5)}%`);

// A missing session must be skipped, not surfaced as NaN or zero.
const holed = await provider.getHistoricalPrices(HOLE_SYMBOL, S);
check("missing sessions are skipped, not zero-filled",
  holed.length === S - 1 && holed.every((b) => Number.isFinite(b.c) && b.c > 0 && Number.isFinite(b.v)),
  `${holed.length} bars, gap removed`);

// Batch path must agree with the single-symbol path.
const batch = await provider.getHistoricalPricesBatch(symbols.slice(0, 40), S);
const single = await provider.getHistoricalPrices(symbols[7], S);
check("batch matches single-symbol reads",
  batch.size === 40 && JSON.stringify(batch.get(symbols[7])) === JSON.stringify(single));

// Unknown symbol -> empty, not a crash.
check("unknown symbol returns no bars", (await provider.getHistoricalPrices("ZZZZZ", 10)).length === 0);

// The universe must be limited to what the dataset covers.
check("universe is limited to covered symbols", (await provider.getUniverse()).length === N);

// Lookback windows return the most recent N sessions.
const tail = await provider.getHistoricalPrices(symbols[0], 30);
check("lookback returns the most recent sessions", tail.length === 30 && tail.at(-1)!.t === dates.at(-1));

// Corrupt file must fail with a clear message rather than garbage.
fs.writeFileSync(".cache/test-bundle.bin", Buffer.from("not a bundle at all, really not"));
resetBundle();
let msg = "";
try { bundleStatus(); } catch (e) { msg = e instanceof Error ? e.message : String(e); }
check("a corrupt dataset fails loudly", msg.includes("bad magic bytes"), msg);

fs.rmSync(".cache/test-bundle.bin", { force: true });
console.log(bad === 0 ? "\nall bundle checks passed" : `\n${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
