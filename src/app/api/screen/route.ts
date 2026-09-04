import { NextResponse } from "next/server";
import { parseScreenRequest, runScan } from "@/lib/engine/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/screen
 *
 * Runs a screen server-side. The whole point of doing this here rather than in
 * the browser is requirement 33: indicator maths over thousands of symbols must
 * not happen on the main thread of someone's phone.
 *
 * The body is untrusted and is normalised by `parseScreenRequest`, which drops
 * anything it does not recognise rather than trying to repair it.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = parseScreenRequest(body);
    const result = await runScan(parsed);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan failed";
    // Provider misconfiguration is the common case here (missing API key), and
    // the message is written to be actionable rather than generic.
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
