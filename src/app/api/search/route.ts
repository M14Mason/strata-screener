import { NextResponse } from "next/server";
import { getProfile, searchListings } from "@/lib/data/reference";

export const runtime = "nodejs";

/** GET /api/search?q=nvid - symbol and company-name lookup for the search box. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").slice(0, 40);
  const results = searchListings(q, 12).map((listing) => ({
    ...listing,
    sector: getProfile(listing.symbol).sector,
  }));
  return NextResponse.json({ results });
}
