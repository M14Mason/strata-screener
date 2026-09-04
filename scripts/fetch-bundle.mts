/**
 * Downloads the prebuilt end-of-day dataset at build time.
 *
 * Keeping the dataset out of git matters: it is tens of megabytes and would be
 * rewritten every day, so committing it would grow the repository without bound.
 * Instead the nightly job publishes it as a GitHub Release asset and the build
 * pulls the current copy.
 *
 * Set EOD_BUNDLE_URL to enable. With the variable unset this is a no-op, so a
 * clone with no configuration still builds and runs (on demo data).
 *
 * Runs automatically via the `prebuild` npm script.
 */
import fs from "node:fs";
import path from "node:path";

const url = process.env.EOD_BUNDLE_URL?.trim();
const out = path.resolve(process.cwd(), process.env.EOD_BUNDLE_PATH || "data/eod-bundle.bin");

if (!url) {
  console.log("[fetch-bundle] EOD_BUNDLE_URL not set — skipping (the app will fall back to demo data).");
  process.exit(0);
}

const headers: Record<string, string> = { accept: "application/octet-stream" };
// Works for a private repo's release asset too, when a token is available.
if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

console.log(`[fetch-bundle] downloading ${url}`);
const res = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(180_000) });

if (!res.ok) {
  // A missing dataset must not fail the build: the app degrades to demo data,
  // which is clearly labelled, rather than the deployment breaking outright.
  console.warn(`[fetch-bundle] HTTP ${res.status} — continuing without a dataset (the app will use demo data).`);
  process.exit(0);
}

const bytes = new Uint8Array(await res.arrayBuffer());
if (bytes.length < 1024) {
  console.warn(`[fetch-bundle] response was only ${bytes.length} bytes — ignoring it.`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, bytes);
console.log(`[fetch-bundle] wrote ${out} (${(bytes.length / 1e6).toFixed(1)} MB)`);
