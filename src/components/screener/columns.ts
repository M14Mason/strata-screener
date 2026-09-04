import type { ResultRow } from "@/lib/engine/scan";
import { NA, fmtCompact, fmtMoneyCompact, fmtNum, fmtPct, fmtPrice, fmtRatio } from "@/lib/client/format";

/**
 * Results-table column definitions (requirement 13).
 *
 * One definition per column drives the header, the cell renderer, the CSV
 * export and the column picker, so a new column is a single entry here.
 */

export interface ColumnDef {
  id: string;
  label: string;
  /** Short header used on narrow screens. */
  short?: string;
  align: "left" | "right";
  /** Rendered text. */
  format: (row: ResultRow) => string;
  /** Raw value for CSV export and sorting. */
  raw: (row: ResultRow) => string | number | null;
  /** Colour the cell by sign. */
  signed?: boolean;
  width?: number;
  sortable?: boolean;
  help?: string;
  /** Columns the user cannot remove. */
  locked?: boolean;
}

export const COLUMNS: ColumnDef[] = [
  { id: "symbol", label: "Symbol", align: "left", width: 88, locked: true, sortable: true, format: (r) => r.symbol, raw: (r) => r.symbol },
  { id: "name", label: "Company", align: "left", width: 220, sortable: true, format: (r) => r.name, raw: (r) => r.name },
  { id: "price", label: "Price", align: "right", width: 92, sortable: true, format: (r) => fmtPrice(r.price), raw: (r) => r.price },
  { id: "changePct", label: "Daily %", short: "Chg %", align: "right", width: 86, sortable: true, signed: true, format: (r) => fmtPct(r.changePct), raw: (r) => r.changePct },
  { id: "volume", label: "Volume", align: "right", width: 92, sortable: true, format: (r) => fmtCompact(r.volume), raw: (r) => r.volume },
  { id: "avgVolume", label: "Avg volume", short: "Avg vol", align: "right", width: 100, sortable: true, format: (r) => fmtCompact(r.avgVolume), raw: (r) => r.avgVolume, help: "20-day average share volume" },
  { id: "relVolume", label: "Rel volume", short: "RVol", align: "right", width: 92, sortable: true, format: (r) => fmtRatio(r.relVolume), raw: (r) => r.relVolume, help: "Today's volume vs the prior 20-day average" },
  { id: "dollarVolume", label: "$ volume", align: "right", width: 100, sortable: true, format: (r) => fmtMoneyCompact(r.dollarVolume), raw: (r) => r.dollarVolume, help: "20-day average dollar volume" },
  { id: "marketCap", label: "Market cap", short: "Mkt cap", align: "right", width: 104, sortable: true, format: (r) => fmtMoneyCompact(r.marketCap), raw: (r) => r.marketCap },
  { id: "rsi2", label: "RSI(2)", align: "right", width: 78, sortable: true, format: (r) => fmtNum(r.rsi2, 1), raw: (r) => r.rsi2, help: "2-period Wilder RSI" },
  { id: "rsi14", label: "RSI(14)", align: "right", width: 80, sortable: true, format: (r) => fmtNum(r.rsi14, 1), raw: (r) => r.rsi14 },
  { id: "sma20", label: "SMA 20", align: "right", width: 90, sortable: true, format: (r) => fmtPrice(r.sma20), raw: (r) => r.sma20 },
  { id: "sma50", label: "SMA 50", align: "right", width: 90, sortable: true, format: (r) => fmtPrice(r.sma50), raw: (r) => r.sma50 },
  { id: "sma200", label: "SMA 200", align: "right", width: 92, sortable: true, format: (r) => fmtPrice(r.sma200), raw: (r) => r.sma200 },
  { id: "distSma50", label: "vs SMA 50", short: "Δ50", align: "right", width: 92, sortable: true, signed: true, format: (r) => fmtPct(r.distSma50, 1), raw: (r) => r.distSma50, help: "Percent above (+) or below (-) the 50-day SMA" },
  { id: "distSma200", label: "vs SMA 200", short: "Δ200", align: "right", width: 96, sortable: true, signed: true, format: (r) => fmtPct(r.distSma200, 1), raw: (r) => r.distSma200, help: "Percent above (+) or below (-) the 200-day SMA" },
  { id: "pctFrom52High", label: "From 52w high", short: "52wH", align: "right", width: 108, sortable: true, signed: true, format: (r) => fmtPct(r.pctFrom52High, 1), raw: (r) => r.pctFrom52High },
  { id: "mom20", label: "20d momentum", short: "Mom 20", align: "right", width: 110, sortable: true, signed: true, format: (r) => fmtPct(r.mom20, 1), raw: (r) => r.mom20 },
  { id: "atrPct", label: "ATR %", align: "right", width: 80, sortable: true, format: (r) => fmtPct(r.atrPct, 1, false), raw: (r) => r.atrPct, help: "ATR(14) as a percent of price" },
  { id: "adx", label: "ADX", align: "right", width: 74, sortable: true, format: (r) => fmtNum(r.adx, 1), raw: (r) => r.adx },
  { id: "beta", label: "Beta", align: "right", width: 74, sortable: true, format: (r) => fmtNum(r.beta, 2), raw: (r) => r.beta },
  { id: "peRatio", label: "P/E", align: "right", width: 76, sortable: true, format: (r) => fmtNum(r.peRatio, 1), raw: (r) => r.peRatio },
  { id: "eps", label: "EPS", align: "right", width: 78, sortable: true, format: (r) => fmtNum(r.eps, 2), raw: (r) => r.eps },
  { id: "dividendYield", label: "Div yield", short: "Div %", align: "right", width: 88, sortable: true, format: (r) => fmtPct(r.dividendYield, 2, false), raw: (r) => r.dividendYield },
  { id: "sector", label: "Sector", align: "left", width: 128, sortable: true, format: (r) => r.sector ?? NA, raw: (r) => r.sector },
];

const index: Record<string, ColumnDef> = Object.create(null);
for (const c of COLUMNS) index[c.id] = c;

export const columnById = (id: string): ColumnDef | undefined => index[id];

/** CSV for the visible columns and rows (requirement 27). */
export function toCsv(rows: ResultRow[], columnIds: string[]): string {
  const cols = columnIds.map(columnById).filter((c): c is ColumnDef => Boolean(c));
  const escape = (value: string | number | null) => {
    if (value == null) return "";
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = cols.map((c) => escape(c.label)).join(",");
  const body = rows.map((row) => cols.map((c) => escape(c.raw(row))).join(","));
  return [header, ...body].join("\n");
}
