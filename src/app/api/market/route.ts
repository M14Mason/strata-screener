import { NextResponse } from "next/server";
import { getProvider } from "@/lib/data/provider";
import { getSnapshots } from "@/lib/engine/store";
import { allListings, getProfile } from "@/lib/data/reference";
import type { Sector } from "@/lib/data/types";
import { SECTORS } from "@/lib/data/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Broad-market ETF proxies used for the dashboard's market strip. */
const BENCHMARKS = [
  { symbol: "SPY", label: "S&P 500" },
  { symbol: "QQQ", label: "Nasdaq 100" },
  { symbol: "DIA", label: "Dow 30" },
  { symbol: "IWM", label: "Russell 2000" },
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
        price: snap?.m.close[0] ?? null,
        changePct: snap?.m.changePct[0] ?? null,
        mom20: snap?.m.mom20[0] ?? null,
        aboveSma200: snap ? (snap.m.close[0] ?? 0) > (snap.m.sma200[0] ?? Infinity) : null,
        sparkline: snap ? [...snap.m.close].slice(0, 22).reverse().filter((v): v is number => v != null) : [],
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
      const change = snap.m.changePct[0];
      const close = snap.m.close[0];
      if (change == null || close == null) continue;
      counted++;
      if (change > 0) advancing++;
      else if (change < 0) declining++;
      if ((snap.m.sma200[0] ?? Infinity) < close) aboveSma200++;
      if ((snap.m.sma50[0] ?? Infinity) < close) aboveSma50++;
      if (snap.m.newHigh52[0] === 1) newHighs++;
      if (snap.m.newLow52[0] === 1) newLows++;

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
