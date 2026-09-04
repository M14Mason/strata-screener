import { NextResponse } from "next/server";
import { getProvider } from "@/lib/data/provider";
import { allListings } from "@/lib/data/reference";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health — a cheap liveness probe for the host's health check.
 * Touches the provider registry and the reference layer, which is enough to
 * catch a broken deployment without doing any real work.
 */
export async function GET() {
  try {
    const provider = getProvider();
    return NextResponse.json({
      ok: true,
      provider: provider.id,
      listings: allListings().length,
      time: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 503 }
    );
  }
}
