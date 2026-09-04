/** Display formatting. Shared by the table, the cards and the stock page. */

/** The single place "we don't have this number" is rendered. */
export const NA = "--";

export function fmtPrice(v: number | null | undefined, currency = true): string {
  if (v == null || !Number.isFinite(v)) return NA;
  const decimals = Math.abs(v) >= 1000 ? 0 : Math.abs(v) >= 1 ? 2 : 4;
  const body = v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return currency ? `$${body}` : body;
}

export function fmtPct(v: number | null | undefined, decimals = 2, signed = true): string {
  if (v == null || !Number.isFinite(v)) return NA;
  const sign = signed && v > 0 ? "+" : "";
  return `${sign}${v.toFixed(decimals)}%`;
}

export function fmtNum(v: number | null | undefined, decimals = 2): string {
  if (v == null || !Number.isFinite(v)) return NA;
  return v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtCompact(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return NA;
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

export function fmtMoneyCompact(v: number | null | undefined): string {
  const body = fmtCompact(v);
  return body === NA ? NA : `$${body}`;
}

export function fmtRatio(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return NA;
  return `${v.toFixed(2)}x`;
}

export function fmtDate(ms: number | null | undefined): string {
  if (!ms) return NA;
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * The "data as of" line. Freshness is stated in the provider's own terms --
 * delayed data is never described as real time, and synthetic data always says
 * so.
 */
export function freshnessLine(f: { latency: string; asOf: number | null; isDemo: boolean }): string {
  if (f.isDemo) return "Simulated data · not market data";
  const when = f.asOf
    ? new Date(f.asOf).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    : "unknown date";
  switch (f.latency) {
    case "realtime":
      return `Real-time · ${when}`;
    case "delayed":
      return `Delayed · close of ${when}`;
    default:
      return `End of day · ${when}`;
  }
}

/** Tailwind-free colour class for a signed number. */
export function moveClass(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v === 0) return "muted";
  return v > 0 ? "up" : "down";
}

export function sectorHue(sector: string | null): number {
  if (!sector) return 220;
  let h = 0;
  for (let i = 0; i < sector.length; i++) h = (h * 31 + sector.charCodeAt(i)) % 360;
  return h;
}
