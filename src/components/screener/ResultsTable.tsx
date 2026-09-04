"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { ResultRow } from "@/lib/engine/scan";
import type { SortSpec } from "@/lib/engine/filters";
import { columnById, type ColumnDef } from "./columns";
import { WhyMatch } from "./WhyMatch";
import { Hint } from "../ui/Primitives";
import { IconChevron, IconInfo } from "../ui/Icons";
import { moveClass } from "@/lib/client/format";

/**
 * Desktop results table (requirement 13).
 *
 * Sorting, hiding and reordering are all driven by the `columns` array the
 * caller owns, so the same list drives the table, the column picker and the CSV
 * export. Rows expand in place to show why they matched, which keeps the
 * explanation next to the numbers it refers to.
 */
export function ResultsTable({
  rows,
  columns,
  sort,
  onSort,
  hasRules,
}: {
  rows: ResultRow[];
  columns: string[];
  sort: SortSpec;
  onSort: (next: SortSpec) => void;
  hasRules: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const defs = columns.map(columnById).filter((c): c is ColumnDef => Boolean(c));

  const toggleSort = (id: string) => {
    if (sort.field === id) onSort({ field: id, dir: sort.dir === "asc" ? "desc" : "asc" });
    else onSort({ field: id, dir: id === "symbol" || id === "name" || id === "sector" ? "asc" : "desc" });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="sticky top-0 z-10" style={{ background: "var(--surface)" }}>
            {hasRules && <th className="w-8 border-b" aria-label="Expand" />}
            {defs.map((col) => {
              const active = sort.field === col.id;
              return (
                <th
                  key={col.id}
                  className="whitespace-nowrap border-b px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider"
                  style={{ textAlign: col.align, width: col.width, color: active ? "var(--accent)" : "var(--text-faint)" }}
                >
                  <button
                    className="inline-flex items-center gap-1"
                    style={{ flexDirection: col.align === "right" ? "row-reverse" : "row" }}
                    onClick={() => col.sortable !== false && toggleSort(col.id)}
                    disabled={col.sortable === false}
                  >
                    {col.help ? (
                      <Hint text={col.help}>
                        <span className="inline-flex items-center gap-1">
                          {col.label}
                          <IconInfo size={11} />
                        </span>
                      </Hint>
                    ) : (
                      col.label
                    )}
                    {active && (
                      <motion.span
                        initial={{ rotate: 0 }}
                        animate={{ rotate: sort.dir === "asc" ? -90 : 90 }}
                        transition={{ duration: 0.16 }}
                        className="inline-flex"
                      >
                        <IconChevron size={11} />
                      </motion.span>
                    )}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const open = expanded === row.symbol;
            return (
              <Fragment key={row.symbol}>
                <tr
                  className="group border-b transition-colors"
                  style={{ background: open ? "var(--surface-hover)" : undefined }}
                >
                  {hasRules && (
                    <td className="px-1">
                      <button
                        className="btn btn-ghost !px-1.5 !py-1"
                        onClick={() => setExpanded(open ? null : row.symbol)}
                        aria-label={open ? "Hide match details" : "Show why this matches"}
                        aria-expanded={open}
                      >
                        <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }} className="inline-flex">
                          <IconChevron size={13} />
                        </motion.span>
                      </button>
                    </td>
                  )}
                  {defs.map((col) => {
                    const text = col.format(row);
                    const value = col.raw(row);
                    const cls = col.signed && typeof value === "number" ? moveClass(value) : "";
                    return (
                      <td
                        key={col.id}
                        className={`whitespace-nowrap px-3 py-2 tnum ${cls}`}
                        style={{ textAlign: col.align }}
                      >
                        {col.id === "symbol" ? (
                          <Link
                            href={`/stock/${row.symbol}`}
                            className="font-semibold transition-colors hover:text-[var(--accent)]"
                          >
                            {row.symbol}
                          </Link>
                        ) : col.id === "name" ? (
                          <Link href={`/stock/${row.symbol}`} className="block max-w-[220px] truncate muted hover:text-[var(--text)]">
                            {text}
                          </Link>
                        ) : (
                          text
                        )}
                      </td>
                    );
                  })}
                </tr>
                <AnimatePresence initial={false}>
                  {open && (
                    <tr>
                      <td colSpan={defs.length + 1} className="p-0">
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                          className="overflow-hidden border-b"
                          style={{ background: "var(--surface-sunken)" }}
                        >
                          <div className="flex flex-col gap-3 px-5 py-3.5 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0">
                              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider faint">
                                Why {row.symbol} matches your screen
                              </p>
                              <WhyMatch trace={row.trace} />
                            </div>
                            <Link href={`/stock/${row.symbol}`} className="btn shrink-0 !py-1.5 text-[12.5px]">
                              View stock
                            </Link>
                          </div>
                        </motion.div>
                      </td>
                    </tr>
                  )}
                </AnimatePresence>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
