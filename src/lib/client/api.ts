import type { ScreenRequest } from "@/lib/engine/filters";
import type { ScanResponse } from "@/lib/engine/scan";

/** Thin typed wrappers over the API routes. */

export async function runScreen(request: ScreenRequest, signal?: AbortSignal): Promise<ScanResponse> {
  const res = await fetch("/api/screen", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `Scan failed (${res.status})`);
  return json as ScanResponse;
}

export interface StockResponse {
  symbol: string;
  name: string;
  exchange: string | null;
  isEtf: boolean;
  known: boolean;
  profile: { sector: string | null; industry: string | null; marketCap: number | null; country: string | null; ipoYear: number | null };
  quote: { price: number; change: number; changePct: number; volume: number; previousClose: number; asOf: number };
  fundamentals: Record<string, number | null>;
  bars: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>;
  metrics: { barCount: number; values: Record<string, number | null>; history: Record<string, (number | null)[]> } | null;
  freshness: { provider: string; providerLabel: string; isDemo: boolean; latency: string; note: string; asOf: number | null };
  range: string;
}

export async function fetchStock(symbol: string, range: string, signal?: AbortSignal): Promise<StockResponse> {
  const res = await fetch(`/api/stock/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}`, { signal });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `Could not load ${symbol}`);
  return json as StockResponse;
}

export interface MarketResponse {
  benchmarks: Array<{
    symbol: string;
    label: string;
    price: number | null;
    changePct: number | null;
    mom20: number | null;
    aboveSma200: boolean | null;
    sparkline: number[];
  }>;
  breadth: {
    sampleSize: number;
    advancing: number;
    declining: number;
    aboveSma200: number;
    aboveSma50: number;
    newHighs: number;
    newLows: number;
  };
  sectors: Array<{ sector: string; changePct: number | null; count: number }>;
  freshness: { provider: string; providerLabel: string; isDemo: boolean; latency: string; note: string; asOf: number | null };
}

export async function fetchMarket(signal?: AbortSignal): Promise<MarketResponse> {
  const res = await fetch("/api/market", { signal });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? "Could not load market overview");
  return json as MarketResponse;
}

export interface DatasetStatus {
  present: boolean;
  path?: string;
  asOf?: number | null;
  sessions?: number;
  symbols?: number;
  builtAt?: number | null;
  sizeBytes?: number | null;
  error?: string;
}

export interface StatusResponse {
  provider: {
    id: string;
    label: string;
    available: string[];
    notes: Record<string, string>;
    configured: boolean;
  };
  freshness: { provider: string; providerLabel: string; isDemo: boolean; latency: string; note: string; asOf: number | null };
  dataset: DatasetStatus;
  universe: {
    total: number;
    stocks: number;
    etfs: number;
    nasdaq: number;
    nyse: number;
    amex: number;
    builtAt: string;
    profilesBuiltAt: string;
  };
  cache: { provider: string; session: string; symbols: number; withData: number };
}

export async function fetchStatus(signal?: AbortSignal): Promise<StatusResponse> {
  const res = await fetch("/api/status", { signal });
  if (!res.ok) throw new Error("Could not read app status");
  return (await res.json()) as StatusResponse;
}

/** Triggers a client-side file download without leaving the page. */
export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
