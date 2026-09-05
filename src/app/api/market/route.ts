import { NextResponse } from "next/server";
import { getProvider } from "@/lib/data/provider";
import { getSnapshots } from "@/lib/engine/store";
import { metricSeries, metricValue } from "@/lib/engine/snapshot";
import { allListings, getProfile } from "@/lib/data/reference";
import type { Sector } from "@/lib/data/types";
import { SECTORS } from "@/lib/data/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Broad-market ETFs used for the dashboard's market strip.
 *
 * These are ETF *share prices*, not index levels, and the two are nowhere near
 * each other: SPY trades around a tenth of the S&P 500. Labelling the card
 * "S&P 500" over a $770 price implied the index had collapsed by a factor of
 * ten, so each entry now carries the fund's own name and the index it tracks,
 * and the UI shows the symbol rather than the index name.
 */
const BENCHMARKS = [
  { symbol: "SPY", label: "SPDR S&P 500 ETF", tracks: "S&P 500" },
  { symbol: "QQQ", label: "Invesco QQQ Trust", tracks: "Nasdaq 100" },
  { symbol: "DIA", label: "SPDR Dow Jones ETF", tracks: "Dow Jones Industrial Average" },
  { symbol: "IWM", label: "iShares Russell 2000 ETF", tracks: "Russell 2000" },
];

/**
 * GET /api/market - the dashboard overview: benchmark proxies, a breadth read,
 * and sector performance. All of it comes off the same snapshot cache the
 * screener uses, so it costs nothing extra once a scan has been run.
 */
export async function GET() {
  const provider = getProvider();

  try {
    const bench = await getSnapshots(BENCHMARKS.map((b) => b.symbol));
    const benchmarks = BENCHMARKS.map((b) => {
      const snap = bench.snapshots.find((s) => s.symbol === b.symbol);
      return {
        symbol: b.symbol,
        label: b.label,
        tracks: b.tracks,
        price: snap ? metricValue(snap, "close") : null,
        changePct: snap ? metricValue(snap, "changePct") : null,
        mom20: snap ? metricValue(snap, "mom20") : null,
        aboveSma200: snap ? (metricValue(snap, "close") ?? 0) > (metricValue(snap, "sma200") ?? Infinity) : null,
        sparkline: snap
          ? Array.from(metricSeries(snap, "close") ?? [])
              .slice(0, 22)
              .reverse()
              .filter((v) => Number.isFinite(v))
          : [],
      };
    });

    // Breadth and sector performance over a liquid slice of the market, so the
    // dashboard stays responsive without a full-universe scan.
    const liquid = allListings()
      .filter((l) => !l.isEtf)
      .map((l) => ({ symbol: l.symbol, cap: getProfile(l.symbol).marketCap ?? 0 }))
      .sort((a, b) => b.cap - a.cap)
      .slice(0, 500)
      .map((l) => l.symbol);

    const { snapshots } = await getSnapshots(liquid);

    let advancing = 0;
    let declining = 0;
    let aboveSma200 = 0;
    let aboveSma50 = 0;
    let newHighs = 0;
    let newLows = 0;
    let counted = 0;

    const sectorTotals = new Map<Sector, { sum: number; n: number }>();

    for (const snap of snapshots) {
      const change = metricValue(snap, "changePct");
      const close = metricValue(snap, "close");
      if (change == null || close == null) continue;
      counted++;
      if (change > 0) advancing++;
      else if (change < 0) declining++;
      if ((metricValue(snap, "sma200") ?? Infinity) < close) aboveSma200++;
      if ((metricValue(snap, "sma50") ?? Infinity) < close) aboveSma50++;
      if (metricValue(snap, "newHigh52") === 1) newHighs++;
      if (metricValue(snap, "newLow52") === 1) newLows++;

      if (snap.sector) {
        const bucket = sectorTotals.get(snap.sector) ?? { sum: 0, n: 0 };
        bucket.sum += change;
        bucket.n++;
        sectorTotals.set(snap.sector, bucket);
      }
    }

    const sectors = SECTORS.filter((s) => s !== "Miscellaneous")
      .map((sector) => {
        const bucket = sectorTotals.get(sector);
        return { sector, changePct: bucket && bucket.n ? bucket.sum / bucket.n : null, count: bucket?.n ?? 0 };
      })
      .filter((s) => s.count > 0)
      .sort((a, b) => (b.changePct ?? -99) - (a.changePct ?? -99));

    const latest = snapshots.reduce((max, s) => Math.max(max, s.asOf), 0);

    return NextResponse.json(
      {
        benchmarks,
        breadth: {
          sampleSize: counted,
          advancing,
          declining,
          aboveSma200,
          aboveSma50,
          newHighs,
          newLows,
        },
        sectors,
        freshness: { ...provider.freshness, asOf: latest || null },
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load market data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
