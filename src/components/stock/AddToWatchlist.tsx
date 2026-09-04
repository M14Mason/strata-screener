"use client";

import { useState } from "react";
import { useStore } from "@/lib/client/store";
import { Sheet } from "../ui/Primitives";
import { IconCheck, IconPlus, IconStar } from "../ui/Icons";

/** Add or remove a symbol from any watchlist, and create one inline. */
export function AddToWatchlist({ symbol, compact = false }: { symbol: string; compact?: boolean }) {
  const { watchlists, addToWatchlist, removeFromWatchlist, createWatchlist } = useStore();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const on = watchlists.some((w) => w.symbols.includes(symbol));

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    createWatchlist(trimmed, [symbol]);
    setName("");
  };

  return (
    <>
      <button
        className={`btn ${compact ? "!px-2" : ""}`}
        onClick={() => setOpen(true)}
        style={on ? { color: "var(--accent)", borderColor: "var(--accent-border)", background: "var(--accent-soft)" } : undefined}
        aria-label={on ? `${symbol} is on a watchlist` : `Add ${symbol} to a watchlist`}
      >
        <IconStar size={15} filled={on} />
        {!compact && <span>{on ? "On watchlist" : "Watchlist"}</span>}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={`Watchlists for ${symbol}`}>
        {watchlists.length === 0 ? (
          <p className="mb-4 text-[13px] muted">You do not have any watchlists yet. Create one below.</p>
        ) : (
          <ul className="mb-4 flex flex-col gap-1.5">
            {watchlists.map((list) => {
              const has = list.symbols.includes(symbol);
              return (
                <li key={list.id}>
                  <button
                    className="flex w-full items-center gap-2.5 rounded-[10px] border px-3 py-2.5 text-left transition-colors"
                    style={{
                      background: has ? "var(--accent-soft)" : "var(--surface)",
                      borderColor: has ? "var(--accent-border)" : "var(--border)",
                    }}
                    onClick={() => (has ? removeFromWatchlist(list.id, symbol) : addToWatchlist(list.id, symbol))}
                  >
                    <span
                      className="grid h-[18px] w-[18px] place-items-center rounded-[5px] border"
                      style={{
                        background: has ? "var(--accent)" : "transparent",
                        borderColor: has ? "var(--accent)" : "var(--border-strong)",
                        color: "var(--accent-contrast)",
                      }}
                    >
                      {has && <IconCheck size={12} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{list.name}</span>
                    <span className="shrink-0 text-[11px] faint">{list.symbols.length}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex gap-2">
          <input
            className="input"
            placeholder="New watchlist name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <button className="btn shrink-0" onClick={create} disabled={!name.trim()}>
            <IconPlus size={15} />
            Create
          </button>
        </div>
      </Sheet>
    </>
  );
}
