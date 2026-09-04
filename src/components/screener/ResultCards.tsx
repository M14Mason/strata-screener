"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ResultRow } from "@/lib/engine/scan";
import { fmtCompact, fmtNum, fmtPct, fmtPrice, moveClass } from "@/lib/client/format";
import { MatchSummary, WhyMatch } from "./WhyMatch";
import { IconChevron } from "../ui/Icons";

/**
 * Mobile result cards (requirement 14).
 *
 * A phone gets cards, not a squeezed table: the four numbers that matter for
 * the screen are laid out in a grid, the match summary sits at the bottom, and
 * the whole card is a link to the stock page with a separate control for the
 * "why" expansion so neither gesture fights the other.
 */
export function ResultCards({ rows, hasRules }: { rows: ResultRow[]; hasRules: boolean }) {
  return (
    <div className="flex flex-col gap-2.5 p-3">
      {rows.map((row, i) => (
        <ResultCard key={row.symbol} row={row} hasRules={hasRules} index={i} />
      ))}
    </div>
  );
}

function ResultCard({ row, hasRules, index }: { row: ResultRow; hasRules: boolean; index: number }) {
  const [open, setOpen] = useState(false);

  return (
    <article
      className="card animate-rise overflow-hidden"
      style={{ "--stagger": `${Math.min(index, 8) * 25}ms` } as React.CSSProperties}
    >
      <Link href={`/stock/${row.symbol}`} className="block px-4 pt-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[16px] font-bold leading-tight">{row.symbol}</h3>
            <p className="mt-0.5 truncate text-[12px] muted">{row.name}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[16px] font-semibold tnum leading-tight">{fmtPrice(row.price)}</p>
            <p className={`text-[12.5px] font-medium tnum ${moveClass(row.changePct)}`}>{fmtPct(row.changePct)}</p>
          </div>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
          <Stat label="RSI(2)" value={fmtNum(row.rsi2, 1)} />
          <Stat label="SMA 200" value={fmtPrice(row.sma200)} />
          <Stat label="vs SMA 200" value={fmtPct(row.distSma200, 1)} tone={moveClass(row.distSma200)} />
          <Stat label="Avg volume" value={fmtCompact(row.avgVolume)} />
        </dl>
      </Link>

      <div className="mt-3 flex items-center justify-between gap-2 border-t px-4 py-2.5">
        <MatchSummary trace={hasRules ? row.trace : null} />
        {hasRules && row.trace && (
          <button
            className="btn btn-ghost !px-2 !py-1 text-[12px]"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Hide match details" : "Show why this matches"}
          >
            Why
            <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }} className="inline-flex">
              <IconChevron size={12} />
            </motion.span>
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t"
            style={{ background: "var(--surface-sunken)" }}
          >
            <div className="px-4 py-3">
              <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider faint">
                Why {row.symbol} matches
              </p>
              <WhyMatch trace={row.trace} compact />
              <Link href={`/stock/${row.symbol}`} className="btn mt-3 w-full !py-2 text-[13px]">
                View stock
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="faint">{label}</dt>
      <dd className={`font-medium tnum ${tone ?? ""}`}>{value}</dd>
    </div>
  );
}
