import { NextResponse } from "next/server";
import { getProvider } from "@/lib/data/provider";
import { getListing, getProfile } from "@/lib/data/reference";
import { demoBeta } from "@/lib/data/demo";
import { LOOKBACK_BARS, METRIC_IDS, metricValue, metricsToObject } from "@/lib/engine/snapshot";
import { getSnapshot } from "@/lib/engine/store";
import type { Bar } from "@/lib/data/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Chart ranges the stock page offers, expressed in trading days. */
const RANGE_DAYS: Record<string, number> = {
  "1D": 2,
  "5D": 5,
  "1M": 22,
  "3M": 66,
  "6M": 126,
  YTD: 0, // resolved against the calendar below
  "1Y": 252,
  "5Y": 1260,
  MAX: 100_000,
};

function tradingDaysThisYear(): number {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const days = Math.max(1, Math.round((now.getTime() - start.getTime()) / 86_400_000));
  return Math.max(5, Math.round(days * (252 / 365)));
}

/**
 * GET /api/stock/AAPL?range=1Y
 *
 * Everything the detail page needs in one round trip: profile, quote,
 * fundamentals, the precomputed indicator snapshot, and the bars for the chart.
 */
export async function GET(request: Request, context: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await context.params;
  const symbol = raw.toUpperCase().replace(/[^A-Z.-]/g, "").slice(0, 6);
  if (!symbol) return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const rangeKey = searchParams.get("range") ?? "1Y";
  const wanted = rangeKey === "YTD" ? tradingDaysThisYear() : (RANGE_DAYS[rangeKey] ?? 252);

  const provider = getProvider();
  const listing = getListing(symbol);
  const profile = getProfile(symbol);

  // A symbol that is not a known U.S. listing must 404 rather than render a
  // page. The demo provider will happily synthesise bars for any string, so
  // without this check an invented ticker would come back looking like a real
  // company with a real chart.
  if (!listing) {
    return NextResponse.json(
      { error: `${symbol} is not a U.S. listing in the current universe (NYSE, NASDAQ or AMEX).` },
      { status: 404 }
    );
  }

  try {
    // Long ranges need their own fetch; anything inside the snapshot window is
    // served from the already-cached bars.
    const barLookback = Math.max(LOOKBACK_BARS, Math.min(wanted + 30, 5000));
    const [bars, fundamentals, snapshot] = await Promise.all([
      provider.getHistoricalPrices(symbol, barLookback),
      provider.getFundamentals(symbol),
      getSnapshot(symbol),
    ]);

    if (!bars.length) {
      return NextResponse.json(
        { error: `No price history available for ${symbol} from ${provider.label}.` },
        { status: 404 }
      );
    }

    if (provider.id === "demo") {
      // Keep beta consistent with what the screener filtered on.
      fundamentals.beta ??= demoBeta(symbol, profile);
    }
    if (snapshot) {
      snapshot.beta = fundamentals.beta ?? snapshot.beta;
      snapshot.peRatio = fundamentals.peRatio ?? snapshot.peRatio;
      snapshot.eps = fundamentals.eps ?? snapshot.eps;
      snapshot.dividendYield = fundamentals.dividendYield ?? snapshot.dividendYield;
    }

    const visible: Bar[] = bars.slice(-wanted);
    const last = bars[bars.length - 1];
    const prev = bars[bars.length - 2] ?? last;

    return NextResponse.json(
      {
        symbol,
        name: listing.name,
        exchange: listing.exchange,
        isEtf: listing.isEtf,
        known: true,
        profile,
        quote: {
          price: last.c,
          change: last.c - prev.c,
          changePct: prev.c ? ((last.c - prev.c) / prev.c) * 100 : 0,
          volume: last.v,
          previousClose: prev.c,
          asOf: last.t,
        },
        fundamentals,
        // The client chart draws overlays from these bars; the snapshot carries
        // the single-value indicator readouts shown beside the chart.
        bars: visible,
        metrics: snapshot
          ? {
              barCount: snapshot.barCount,
              values: Object.fromEntries(METRIC_IDS.map((id) => [id, metricValue(snapshot, id)])),
              history: metricsToObject(snapshot),
            }
          : null,
        freshness: { ...provider.freshness, asOf: last.t },
        range: rangeKey,
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load stock";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
