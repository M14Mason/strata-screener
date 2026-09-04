"use client";

import { NA, fmtMoneyCompact, fmtNum, fmtPct, fmtRatio } from "@/lib/client/format";
import { Hint } from "../ui/Primitives";
import { IconInfo } from "../ui/Icons";

/**
 * Fundamentals grid (requirement 18).
 *
 * Missing values render as an explicit "--" with a note naming the provider,
 * because a fundamental that the feed does not supply must never be shown as a
 * zero or quietly omitted.
 */

type Fund = Record<string, number | null>;

const ROWS: Array<{ key: string; label: string; format: (v: number) => string; help?: string }> = [
  { key: "marketCap", label: "Market cap", format: fmtMoneyCompact },
  { key: "revenue", label: "Revenue (TTM)", format: fmtMoneyCompact },
  { key: "revenueGrowth", label: "Revenue growth", format: (v) => fmtPct(v, 1) },
  { key: "eps", label: "EPS (TTM)", format: (v) => fmtNum(v, 2) },
  { key: "epsGrowth", label: "EPS growth", format: (v) => fmtPct(v, 1) },
  { key: "peRatio", label: "P/E", format: (v) => fmtNum(v, 1) },
  { key: "forwardPe", label: "Forward P/E", format: (v) => fmtNum(v, 1), help: "Only shown when the provider supplies a forward estimate." },
  { key: "priceToSales", label: "Price / sales", format: (v) => fmtNum(v, 2) },
  { key: "priceToBook", label: "Price / book", format: (v) => fmtNum(v, 2) },
  { key: "freeCashFlow", label: "Free cash flow", format: fmtMoneyCompact },
  { key: "debtToEquity", label: "Debt / equity", format: (v) => fmtNum(v, 2) },
  { key: "profitMargin", label: "Profit margin", format: (v) => fmtPct(v, 1, false) },
  { key: "returnOnEquity", label: "Return on equity", format: (v) => fmtPct(v, 1, false) },
  { key: "dividendYield", label: "Dividend yield", format: (v) => fmtPct(v, 2, false) },
  { key: "beta", label: "Beta", format: (v) => fmtNum(v, 2) },
];

export function Fundamentals({ data, providerLabel }: { data: Fund; providerLabel: string }) {
  const missing = ROWS.filter((r) => data[r.key] == null).length;

  return (
    <div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-0 sm:grid-cols-3">
        {ROWS.map((row) => {
          const value = data[row.key];
          const available = value != null && Number.isFinite(value);
          return (
            <div key={row.key} className="flex items-baseline justify-between gap-3 border-b py-2.5 text-[13px]">
              <dt className="min-w-0 truncate muted">
                {row.help ? (
                  <Hint text={row.help}>
                    <span className="inline-flex items-center gap-1">
                      {row.label}
                      <IconInfo size={11} />
                    </span>
                  </Hint>
                ) : (
                  row.label
                )}
              </dt>
              <dd className={`shrink-0 font-medium tnum ${available ? "" : "faint"}`}>
                {available ? row.format(value as number) : NA}
              </dd>
            </div>
          );
        })}
      </dl>
      {missing > 0 && (
        <p className="mt-3 text-[11.5px] leading-relaxed faint">
          {missing} of {ROWS.length} figures are shown as {NA} because {providerLabel} does not supply them through the
          endpoints this app uses. They are left blank rather than estimated.
        </p>
      )}
    </div>
  );
}

export { fmtRatio };
