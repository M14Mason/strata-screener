import { NextResponse } from "next/server";
import { getProvider, PROVIDER_IDS, PROVIDER_NOTES } from "@/lib/data/provider";
import { allListings, PROFILES_BUILT_AT, REFERENCE_BUILT_AT } from "@/lib/data/reference";
import { bundleStatus } from "@/lib/data/bundle";
import { snapshotCacheStats } from "@/lib/engine/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/status — what the Settings page and the data badge report.
 * Deliberately exposes provider *ids* only; API keys never leave the server.
 */
export async function GET() {
  const provider = getProvider();
  const listings = allListings();

  let dataset: ReturnType<typeof bundleStatus> | { present: false; error: string };
  try {
    dataset = bundleStatus();
  } catch (error) {
    dataset = { present: false, error: error instanceof Error ? error.message : "unreadable" };
  }

  return NextResponse.json({
    provider: {
      id: provider.id,
      label: provider.label,
      available: PROVIDER_IDS,
      notes: PROVIDER_NOTES,
      configured: Boolean(process.env.MARKET_DATA_PROVIDER),
    },
    freshness: { ...provider.freshness, asOf: "asOf" in dataset ? (dataset.asOf ?? null) : null },
    dataset,
    universe: {
      total: listings.length,
      stocks: listings.filter((l) => !l.isEtf).length,
      etfs: listings.filter((l) => l.isEtf).length,
      nasdaq: listings.filter((l) => l.exchange === "NASDAQ").length,
      nyse: listings.filter((l) => l.exchange === "NYSE").length,
      amex: listings.filter((l) => l.exchange === "AMEX").length,
      builtAt: REFERENCE_BUILT_AT,
      profilesBuiltAt: PROFILES_BUILT_AT,
    },
    cache: snapshotCacheStats(),
  });
}
