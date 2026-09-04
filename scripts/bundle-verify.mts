/**
 * Sanity-checks a built dataset before it is published.
 *
 * A silently corrupt or half-empty dataset would be worse than none at all --
 * the app would serve confident-looking numbers off bad data -- so the nightly
 * job refuses to publish unless these hold.
 */
import { bundleStatus, BundleProvider, resetBundle } from "../src/lib/data/bundle";

resetBundle();
const status = bundleStatus();

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  " + detail : ""}`);
  if (!ok) failures++;
};

check("dataset exists", status.present, status.path);
if (!status.present) process.exit(1);

check("has a usable number of symbols", status.symbols >= 500, `${status.symbols.toLocaleString()} symbols`);
check("has enough history for SMA 200", status.sessions >= 220, `${status.sessions} sessions`);

const asOf = status.asOf ? new Date(status.asOf) : null;
const ageDays = asOf ? (Date.now() - asOf.getTime()) / 86_400_000 : Infinity;
check("latest session is recent", ageDays <= 5, asOf ? `${asOf.toISOString().slice(0, 10)} (${ageDays.toFixed(1)}d old)` : "none");

// Spot-check that the bars actually decode into sane prices.
const provider = new BundleProvider();
const universe = await provider.getUniverse();
const sample = universe.slice(0, 250);
let withHistory = 0;
let sane = 0;
for (const listing of sample) {
  const bars = await provider.getHistoricalPrices(listing.symbol, 320);
  if (bars.length < 200) continue;
  withHistory++;
  const ok = bars.every(
    (b) =>
      Number.isFinite(b.o) && Number.isFinite(b.h) && Number.isFinite(b.l) && Number.isFinite(b.c) &&
      b.c > 0 && b.h >= b.l && b.h >= b.c && b.l <= b.c && b.v >= 0
  );
  if (ok) sane++;
}
check("most sampled symbols carry full history", withHistory >= sample.length * 0.6, `${withHistory}/${sample.length}`);
check("every sampled bar satisfies OHLC invariants", withHistory > 0 && sane === withHistory, `${sane}/${withHistory}`);

console.log(failures === 0 ? "\ndataset looks good" : `\n${failures} check(s) failed — not publishing`);
process.exit(failures === 0 ? 0 : 1);
