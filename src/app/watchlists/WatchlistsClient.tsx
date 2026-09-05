"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { runScreen } from "@/lib/client/api";
import type { ResultRow } from "@/lib/engine/scan";
import { emptyScreen } from "@/lib/engine/filters";
import { useStore, type Watchlist } from "@/lib/client/store";
import { NA, fmtCompact, fmtNum, fmtPct, fmtPrice, moveClass } from "@/lib/client/format";
import { DataBadge, DemoBanner, StaleBanner, type Freshness } from "@/components/DataBadge";
import { ConfirmButton, EmptyState, Field, Sheet, Skeleton } from "@/components/ui/Primitives";
import { IconClose, IconPlus, IconScreener, IconSearch, IconTrash, IconWatchlist } from "@/components/ui/Icons";

/** Watchlists (requirement 19), quoted through the same scan engine. */
export default function WatchlistsClient() {
  const { watchlists, createWatchlist, renameWatchlist, deleteWatchlist, addToWatchlist, removeFromWatchlist, ready } =
    useStore();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [freshness, setFreshness] = useState<Freshness | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  const active: Watchlist | undefined = useMemo(
    () => watchlists.find((w) => w.id === activeId) ?? watchlists[0],
    [watchlists, activeId]
  );

  const load = useCallback(async (symbols: string[]) => {
    if (!symbols.length) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const base = emptyScreen();
      const response = await runScreen({
        ...base,
        // A watchlist is quoted exactly as it is: no penny-stock or ETF filter
        // should silently hide something the user chose to track.
        universe: { scope: "watchlist", includeEtfs: true, excludePenny: false, pennyThreshold: 0, symbols },
        rules: null,
        sort: { field: "symbol", dir: "asc" },
        limit: 500,
      });
      setRows(response.rows);
      setFreshness(response.meta.freshness);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (active) load(active.symbols);
  }, [active?.id, active?.symbols.join(","), load]);

  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:px-6 md:py-5">
      <DemoBanner freshness={freshness} />
      <StaleBanner freshness={freshness} />

      {!ready ? null : watchlists.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No watchlists yet"
            body="Group the symbols you want to keep an eye on — “AI stocks”, “potential pullbacks”, anything. You can also screen a watchlist directly instead of the whole market."
            icon={<IconWatchlist size={26} />}
            action={
              <button className="btn btn-primary" onClick={() => setCreating(true)}>
                <IconPlus size={15} />
                Create a watchlist
              </button>
            }
          />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {watchlists.map((list) => {
              const isActive = list.id === active?.id;
              return (
                <button
                  key={list.id}
                  className="chip"
                  data-active={isActive ? "true" : "false"}
                  onClick={() => setActiveId(list.id)}
                >
                  {list.name}
                  <span className="faint">{list.symbols.length}</span>
                </button>
              );
            })}
            <button className="chip" onClick={() => setCreating(true)}>
              <IconPlus size={13} />
              New
            </button>
          </div>

          {active && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[18px] font-bold tracking-tight">{active.name}</h2>
                <span className="text-[12px] faint">
                  {active.symbols.length} {active.symbols.length === 1 ? "symbol" : "symbols"}
                </span>
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  <Link
                    href={`/screener?symbols=${encodeURIComponent(active.symbols.join(","))}`}
                    className="btn !py-1.5 text-[12.5px]"
                  >
                    <IconScreener size={14} />
                    Screen this list
                  </Link>
                  <button
                    className="btn btn-ghost !py-1.5 text-[12.5px]"
                    onClick={() => setRenaming({ id: active.id, name: active.name })}
                  >
                    Rename
                  </button>
                  <ConfirmButton
                    className="btn btn-danger !py-1.5 text-[12.5px]"
                    onConfirm={() => {
                      deleteWatchlist(active.id);
                      setActiveId(null);
                    }}
                    label={`Delete ${active.name}`}
                    confirmLabel="Delete for good?"
                  >
                    <IconTrash size={14} />
                    Delete
                  </ConfirmButton>
                </div>
              </div>

              <AddSymbol onAdd={(symbol) => addToWatchlist(active.id, symbol)} existing={active.symbols} />

              {freshness && <DataBadge freshness={freshness} />}

              {active.symbols.length === 0 ? (
                <div className="card">
                  <EmptyState
                    title="This watchlist is empty"
                    body="Search for a symbol above, or add stocks from the screener results and stock pages."
                  />
                </div>
              ) : loading && rows.length === 0 ? (
                <div className="flex flex-col gap-2">
                  {active.symbols.slice(0, 8).map((s) => (
                    <Skeleton key={s} className="h-[46px]" />
                  ))}
                </div>
              ) : (
                <>
                  {/* desktop table */}
                  <div className="card hidden overflow-x-auto md:block">
                    <table className="w-full border-collapse text-[13px]">
                      <thead>
                        <tr>
                          {["Symbol", "Company", "Price", "Daily %", "RSI(2)", "RSI(14)", "SMA 50", "SMA 200", "Volume", ""].map(
                            (h, i) => (
                              <th
                                key={h + i}
                                className="whitespace-nowrap border-b px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider faint"
                                style={{ textAlign: i === 0 || i === 1 ? "left" : i === 9 ? "center" : "right" }}
                              >
                                {h}
                              </th>
                            )
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {active.symbols.map((symbol) => {
                          const row = rows.find((r) => r.symbol === symbol);
                          return (
                            <tr key={symbol} className="border-b">
                              <td className="px-3 py-2">
                                <Link href={`/stock/${symbol}`} className="font-semibold hover:text-[var(--accent)]">
                                  {symbol}
                                </Link>
                              </td>
                              <td className="max-w-[220px] truncate px-3 py-2 muted">{row?.name ?? NA}</td>
                              <td className="px-3 py-2 text-right tnum">{fmtPrice(row?.price)}</td>
                              <td className={`px-3 py-2 text-right tnum ${moveClass(row?.changePct)}`}>
                                {fmtPct(row?.changePct)}
                              </td>
                              <td className="px-3 py-2 text-right tnum">{fmtNum(row?.rsi2, 1)}</td>
                              <td className="px-3 py-2 text-right tnum">{fmtNum(row?.rsi14, 1)}</td>
                              <td className="px-3 py-2 text-right tnum">{fmtPrice(row?.sma50)}</td>
                              <td className="px-3 py-2 text-right tnum">{fmtPrice(row?.sma200)}</td>
                              <td className="px-3 py-2 text-right tnum">{fmtCompact(row?.volume)}</td>
                              <td className="px-2 py-2 text-center">
                                <button
                                  className="btn btn-ghost !px-1.5 !py-1"
                                  onClick={() => removeFromWatchlist(active.id, symbol)}
                                  aria-label={`Remove ${symbol}`}
                                >
                                  <IconClose size={13} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* mobile cards */}
                  <div className="flex flex-col gap-2.5 md:hidden">
                    {active.symbols.map((symbol) => {
                      const row = rows.find((r) => r.symbol === symbol);
                      return (
                        <article key={symbol} className="card px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <Link href={`/stock/${symbol}`} className="min-w-0">
                              <h3 className="text-[15px] font-bold">{symbol}</h3>
                              <p className="truncate text-[12px] muted">{row?.name ?? NA}</p>
                            </Link>
                            <div className="shrink-0 text-right">
                              <p className="text-[15px] font-semibold tnum">{fmtPrice(row?.price)}</p>
                              <p className={`text-[12.5px] font-medium tnum ${moveClass(row?.changePct)}`}>
                                {fmtPct(row?.changePct)}
                              </p>
                            </div>
                            <button
                              className="btn btn-ghost !px-1.5 !py-1"
                              onClick={() => removeFromWatchlist(active.id, symbol)}
                              aria-label={`Remove ${symbol}`}
                            >
                              <IconClose size={14} />
                            </button>
                          </div>
                          <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px]">
                            <Stat label="RSI(2)" value={fmtNum(row?.rsi2, 1)} />
                            <Stat label="RSI(14)" value={fmtNum(row?.rsi14, 1)} />
                            <Stat label="SMA 50" value={fmtPrice(row?.sma50)} />
                            <Stat label="SMA 200" value={fmtPrice(row?.sma200)} />
                            <Stat label="Volume" value={fmtCompact(row?.volume)} />
                            <Stat label="vs SMA 200" value={fmtPct(row?.distSma200, 1)} tone={moveClass(row?.distSma200)} />
                          </dl>
                        </article>
                      );
                    })}
                  </div>

                  {rows.length < active.symbols.length && (
                    <p className="text-[11.5px] faint">
                      {active.symbols.length - rows.length} symbol
                      {active.symbols.length - rows.length === 1 ? "" : "s"} had no usable price history from the current
                      provider and show {NA}.
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      <Sheet
        open={creating}
        onClose={() => setCreating(false)}
        title="New watchlist"
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={!newName.trim()}
              onClick={() => {
                const list = createWatchlist(newName.trim());
                setActiveId(list.id);
                setNewName("");
                setCreating(false);
              }}
            >
              Create
            </button>
          </div>
        }
      >
        <Field label="Name" hint="For example: AI stocks, Quantum, Potential pullbacks.">
          <input autoFocus className="input" value={newName} onChange={(e) => setNewName(e.target.value)} />
        </Field>
      </Sheet>

      <Sheet
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Rename watchlist"
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={() => setRenaming(null)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                if (renaming?.name.trim()) renameWatchlist(renaming.id, renaming.name.trim());
                setRenaming(null);
              }}
            >
              Save
            </button>
          </div>
        }
      >
        <Field label="Name">
          <input
            autoFocus
            className="input"
            value={renaming?.name ?? ""}
            onChange={(e) => setRenaming((r) => (r ? { ...r, name: e.target.value } : r))}
          />
        </Field>
      </Sheet>
    </div>
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

interface Hit {
  symbol: string;
  name: string;
  exchange: string;
  isEtf: boolean;
}

function AddSymbol({ onAdd, existing }: { onAdd: (symbol: string) => void; existing: string[] }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const json = await res.json();
        setHits(json.results ?? []);
      } catch {
        /* aborted */
      }
    }, 130);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={boxRef} className="relative max-w-[440px]">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 faint">
        <IconSearch size={15} />
      </span>
      <input
        className="input !pl-9"
        placeholder="Add a symbol to this watchlist"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
      />
      <AnimatePresence>
        {open && hits.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.13 }}
            className="absolute left-0 top-[calc(100%+6px)] z-40 max-h-[300px] w-full overflow-y-auto rounded-xl border py-1"
            style={{ background: "var(--bg-elevated)", boxShadow: "var(--shadow-pop)" }}
          >
            {hits.map((hit) => {
              const already = existing.includes(hit.symbol);
              return (
                <li key={hit.symbol}>
                  <button
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-45"
                    disabled={already}
                    onClick={() => {
                      onAdd(hit.symbol);
                      setQuery("");
                      setOpen(false);
                    }}
                  >
                    <span className="w-[58px] shrink-0 text-[13px] font-semibold">{hit.symbol}</span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] muted">{hit.name}</span>
                    <span className="shrink-0 text-[10.5px] faint">{already ? "Added" : hit.isEtf ? "ETF" : hit.exchange}</span>
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
