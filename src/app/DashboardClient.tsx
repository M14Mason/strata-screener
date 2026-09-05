"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { fetchMarket, type MarketResponse } from "@/lib/client/api";
import { fmtPct, fmtPrice, moveClass } from "@/lib/client/format";
import { PRESET_STRATEGIES } from "@/lib/engine/presets";
import { countConditions, summarizeRules } from "@/lib/engine/rules";
import { useStore } from "@/lib/client/store";
import { DataBadge, DemoBanner, StaleBanner } from "@/components/DataBadge";
import { Sparkline } from "@/components/Sparkline";
import { EmptyState, Skeleton } from "@/components/ui/Primitives";
import { IconPlay, IconScreener, IconStrategy, IconWarn } from "@/components/ui/Icons";

/** Dashboard: market overview plus the user's saved strategies (requirement 2). */
export default function DashboardClient() {
  const { strategies, watchlists, ready } = useStore();
  const [market, setMarket] = useState<MarketResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchMarket(controller.signal)
      .then(setMarket)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Could not load market data");
      });
    return () => controller.abort();
  }, []);

  const breadth = market?.breadth;

  return (
    <div className="flex flex-col gap-5 px-4 py-4 md:px-6 md:py-5">
      <DemoBanner freshness={market?.freshness ?? null} />
      <StaleBanner freshness={market?.freshness ?? null} />

      <section>
        <div className="mb-2.5 flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold">Market overview</h2>
          <DataBadge freshness={market?.freshness ?? null} />
        </div>

        {error ? (
          <div className="card px-4 py-4">
            <p className="flex items-start gap-2 text-[13px] muted">
              <span style={{ color: "var(--warn)" }}>
                <IconWarn size={15} />
              </span>
              {error}
            </p>
          </div>
        ) : !market ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[96px]" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {market.benchmarks.map((b, i) => (
              <div key={b.symbol} className="animate-rise" style={{ "--stagger": `${i * 45}ms` } as React.CSSProperties}>
                <Link href={`/stock/${b.symbol}`} className="card block px-4 py-3.5 transition-colors hover:border-[var(--border-strong)]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold">{b.label}</p>
                      <p className="text-[11px] faint">{b.symbol}</p>
                    </div>
                    <Sparkline values={b.sparkline} />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-[17px] font-bold tnum">{fmtPrice(b.price)}</span>
                    <span className={`text-[13px] font-semibold tnum ${moveClass(b.changePct)}`}>{fmtPct(b.changePct)}</span>
                  </div>
                  {b.aboveSma200 != null && (
                    <p className="mt-1 text-[11px] faint">
                      {b.aboveSma200 ? "Above" : "Below"} its 200-day average
                    </p>
                  )}
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* --------------------------------------------------------- breadth */}
      {breadth && breadth.sampleSize > 0 && (
        <section className="card px-4 py-4">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-semibold">Market breadth</h2>
            <p className="text-[11px] faint">
              Across the {breadth.sampleSize.toLocaleString()} largest U.S. stocks
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
            <BreadthStat label="Advancing" value={breadth.advancing} total={breadth.sampleSize} tone="up" />
            <BreadthStat label="Declining" value={breadth.declining} total={breadth.sampleSize} tone="down" />
            <BreadthStat label="Above SMA 50" value={breadth.aboveSma50} total={breadth.sampleSize} />
            <BreadthStat label="Above SMA 200" value={breadth.aboveSma200} total={breadth.sampleSize} />
            <BreadthStat label="New 52w highs" value={breadth.newHighs} total={breadth.sampleSize} tone="up" />
            <BreadthStat label="New 52w lows" value={breadth.newLows} total={breadth.sampleSize} tone="down" />
          </div>

          {market && market.sectors.length > 0 && (
            <div className="mt-5 border-t pt-4">
              <h3 className="label">Sector performance today</h3>
              <div className="flex flex-col gap-1.5">
                {market.sectors.map((s) => {
                  const value = s.changePct ?? 0;
                  const scale = Math.max(...market.sectors.map((x) => Math.abs(x.changePct ?? 0)), 0.4);
                  return (
                    <div key={s.sector} className="flex items-center gap-3 text-[12.5px]">
                      <span className="w-[104px] shrink-0 truncate muted">{s.sector}</span>
                      <span className="relative h-3 flex-1 overflow-hidden rounded-full" style={{ background: "var(--surface-sunken)" }}>
                        <motion.span
                          className="absolute top-0 h-full"
                          style={{
                            background: value >= 0 ? "var(--up)" : "var(--down)",
                            left: value >= 0 ? "50%" : undefined,
                            right: value < 0 ? "50%" : undefined,
                            opacity: 0.75,
                          }}
                          initial={{ width: 0 }}
                          animate={{ width: `${(Math.abs(value) / scale) * 50}%` }}
                          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                        />
                        <span className="absolute left-1/2 top-0 h-full w-px" style={{ background: "var(--border-strong)" }} />
                      </span>
                      <span className={`w-[62px] shrink-0 text-right font-medium tnum ${moveClass(s.changePct)}`}>
                        {fmtPct(s.changePct)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ------------------------------------------------ saved strategies */}
      <section>
        <div className="mb-2.5 flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold">Your strategies</h2>
          <Link href="/strategies" className="text-[12.5px] font-medium" style={{ color: "var(--accent)" }}>
            View all
          </Link>
        </div>

        {!ready ? (
          <Skeleton className="h-[110px]" />
        ) : strategies.length === 0 ? (
          <div className="card">
            <EmptyState
              title="No saved strategies yet"
              body="Build a screen in the screener and save it, or start from one of the prebuilt strategies in the library."
              icon={<IconStrategy size={26} />}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Link href="/screener" className="btn btn-primary">
                    <IconScreener size={15} />
                    Open the screener
                  </Link>
                  <Link href="/strategies" className="btn">
                    Browse the library
                  </Link>
                </div>
              }
            />
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {strategies.slice(0, 6).map((strategy) => (
              <Link
                key={strategy.id}
                href={`/screener?strategy=${strategy.id}`}
                className="card block px-4 py-3.5 transition-colors hover:border-[var(--border-strong)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 truncate text-[14px] font-semibold">{strategy.name}</h3>
                  <span className="chip shrink-0 !py-0.5 !text-[10.5px]">
                    {countConditions(strategy.rules)} cond
                  </span>
                </div>
                <ul className="mt-2 flex flex-col gap-0.5">
                  {summarizeRules(strategy.rules)
                    .slice(0, 3)
                    .map((line, i) => (
                      <li key={i} className="truncate text-[11.5px] tnum faint">
                        · {line}
                      </li>
                    ))}
                </ul>
                <span className="mt-2.5 inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: "var(--accent)" }}>
                  <IconPlay size={12} />
                  Run this screen
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ----------------------------------------------- prebuilt shortcuts */}
      <section>
        <h2 className="mb-2.5 text-[15px] font-semibold">Start from a prebuilt screen</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {PRESET_STRATEGIES.slice(0, 6).map((preset) => (
            <Link
              key={preset.id}
              href={`/screener?preset=${preset.id}`}
              className="card block px-4 py-3.5 transition-colors hover:border-[var(--border-strong)]"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="min-w-0 text-[14px] font-semibold">{preset.name}</h3>
                <span className="chip shrink-0 !py-0.5 !text-[10.5px]">{preset.category}</span>
              </div>
              <p className="mt-1 text-[12px] leading-snug muted">{preset.tagline}</p>
            </Link>
          ))}
        </div>
      </section>

      {watchlists.length > 0 && (
        <section>
          <h2 className="mb-2.5 text-[15px] font-semibold">Your watchlists</h2>
          <div className="flex flex-wrap gap-2">
            {watchlists.map((list) => (
              <Link key={list.id} href="/watchlists" className="chip">
                {list.name}
                <span className="faint">{list.symbols.length}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <p className="pb-2 text-center text-[11px] leading-relaxed faint">
        Strata answers one question: which stocks currently match the conditions you selected. It does not produce
        signals, alerts, backtests or recommendations.
      </p>
    </div>
  );
}

function BreadthStat({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone?: "up" | "down";
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <p className="text-[10.5px] font-semibold uppercase tracking-wider faint">{label}</p>
      <p className={`mt-0.5 text-[18px] font-bold tnum ${tone ?? ""}`}>{value.toLocaleString()}</p>
      <p className="text-[11px] tnum faint">{pct.toFixed(0)}% of sample</p>
    </div>
  );
}
