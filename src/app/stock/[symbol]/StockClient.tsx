"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { fetchStock, type StockResponse } from "@/lib/client/api";
import { NA, fmtCompact, fmtNum, fmtPct, fmtPrice, moveClass } from "@/lib/client/format";
import { DataBadge, DemoBanner } from "@/components/DataBadge";
import { CandleChart, OVERLAY_OPTIONS, PANE_OPTIONS, type OverlayId, type PaneId } from "@/components/stock/CandleChart";
import { Fundamentals } from "@/components/stock/Fundamentals";
import { AddToWatchlist } from "@/components/stock/AddToWatchlist";
import { Chip, EmptyState, Select, Skeleton } from "@/components/ui/Primitives";
import { IconWarn } from "@/components/ui/Icons";

const RANGES = ["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "5Y", "MAX"] as const;
const RSI_PERIODS = [2, 3, 5, 7, 9, 14, 21];

/** Stock detail page (requirements 16-18). */
export default function StockClient({ symbol }: { symbol: string }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>("1Y");
  const [data, setData] = useState<StockResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [overlays, setOverlays] = useState<OverlayId[]>(["sma50", "sma200"]);
  const [panes, setPanes] = useState<PaneId[]>(["volume", "rsi"]);
  const [rsiPeriod, setRsiPeriod] = useState(14);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchStock(symbol, range, controller.signal)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Could not load this stock");
        setLoading(false);
      });
    return () => controller.abort();
  }, [symbol, range]);

  const toggle = <T,>(list: T[], value: T, set: (next: T[]) => void) =>
    set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  const metrics = data?.metrics?.values ?? {};

  const technicalRows = useMemo(
    () => [
      { label: "RSI(2)", value: fmtNum(metrics.rsi2, 1) },
      { label: "RSI(14)", value: fmtNum(metrics.rsi14, 1) },
      { label: "SMA 20", value: fmtPrice(metrics.sma20) },
      { label: "SMA 50", value: fmtPrice(metrics.sma50) },
      { label: "SMA 200", value: fmtPrice(metrics.sma200) },
      { label: "EMA 20", value: fmtPrice(metrics.ema20) },
      { label: "vs SMA 50", value: fmtPct(metrics.distSma50, 1), tone: moveClass(metrics.distSma50) },
      { label: "vs SMA 200", value: fmtPct(metrics.distSma200, 1), tone: moveClass(metrics.distSma200) },
      { label: "MACD", value: fmtNum(metrics.macd, 3) },
      { label: "MACD signal", value: fmtNum(metrics.macdSignal, 3) },
      { label: "ADX (14)", value: fmtNum(metrics.adx14, 1) },
      { label: "ATR %", value: fmtPct(metrics.atrPct, 2, false) },
      { label: "Stoch %K", value: fmtNum(metrics.stochK, 1) },
      { label: "Stoch %D", value: fmtNum(metrics.stochD, 1) },
      { label: "Bollinger %B", value: fmtNum(metrics.bbPercentB, 1) },
      { label: "Band width %", value: fmtPct(metrics.bbWidth, 1, false) },
      { label: "VWAP (20d)", value: fmtPrice(metrics.vwap20) },
      { label: "Rel volume", value: metrics.relVolume != null ? `${metrics.relVolume.toFixed(2)}x` : NA },
      { label: "Avg volume (20d)", value: fmtCompact(metrics.avgVol20) },
      { label: "52-week high", value: fmtPrice(metrics.high52) },
      { label: "52-week low", value: fmtPrice(metrics.low52) },
      { label: "From 52w high", value: fmtPct(metrics.pctFrom52High, 1), tone: moveClass(metrics.pctFrom52High) },
      { label: "20-day momentum", value: fmtPct(metrics.mom20, 1), tone: moveClass(metrics.mom20) },
      { label: "1-year momentum", value: fmtPct(metrics.mom252, 1), tone: moveClass(metrics.mom252) },
    ],
    [metrics]
  );

  if (error) {
    return (
      <div className="px-4 py-8 md:px-6">
        <EmptyState
          title={`Could not load ${symbol}`}
          body={error}
          icon={<IconWarn size={26} />}
          action={
            <Link href="/screener" className="btn">
              Back to the screener
            </Link>
          }
        />
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-4 px-4 py-5 md:px-6">
        <Skeleton className="h-[86px] w-full" />
        <Skeleton className="h-[440px] w-full" />
      </div>
    );
  }

  if (!data) return null;

  const { quote, profile, fundamentals, freshness } = data;

  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:px-6 md:py-5">
      <DemoBanner freshness={freshness} />

      {/* ------------------------------------------------------------ header */}
      <header className="card px-4 py-4 md:px-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[26px] font-bold tracking-tight">{data.symbol}</h1>
              {data.exchange && (
                <span className="chip !py-0.5 !text-[10.5px]">{data.isEtf ? "ETF" : data.exchange}</span>
              )}
              {profile.sector && <span className="chip !py-0.5 !text-[10.5px]">{profile.sector}</span>}
            </div>
            <p className="mt-1 text-[13.5px] muted">{data.name}</p>
            {profile.industry && <p className="mt-0.5 text-[11.5px] faint">{profile.industry}</p>}
          </div>

          <div className="flex items-start gap-4">
            <div className="text-right">
              <motion.p
                key={quote.price}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-[30px] font-bold leading-none tnum"
              >
                {fmtPrice(quote.price)}
              </motion.p>
              <p className={`mt-1.5 text-[14px] font-semibold tnum ${moveClass(quote.changePct)}`}>
                {quote.change >= 0 ? "+" : ""}
                {fmtPrice(quote.change, false)} ({fmtPct(quote.changePct)})
              </p>
            </div>
            <AddToWatchlist symbol={data.symbol} />
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2 border-t pt-3 text-[12.5px] sm:grid-cols-3 lg:grid-cols-6">
          <HeaderStat label="Market cap" value={profile.marketCap ? `$${fmtCompact(profile.marketCap)}` : NA} />
          <HeaderStat label="Beta" value={fmtNum(fundamentals.beta, 2)} />
          <HeaderStat label="P/E" value={fmtNum(fundamentals.peRatio, 1)} />
          <HeaderStat label="EPS" value={fmtNum(fundamentals.eps, 2)} />
          <HeaderStat label="Div yield" value={fmtPct(fundamentals.dividendYield, 2, false)} />
          <HeaderStat label="Volume" value={fmtCompact(quote.volume)} />
        </dl>

        <div className="mt-3 border-t pt-2.5">
          <DataBadge freshness={freshness} />
        </div>
      </header>

      {/* ------------------------------------------------------------- chart */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
          <div className="flex overflow-x-auto rounded-[9px] border p-0.5" style={{ background: "var(--surface-sunken)" }}>
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className="relative shrink-0 rounded-[7px] px-2.5 py-1 text-[12px] font-semibold transition-colors"
                style={{ color: r === range ? "var(--accent-contrast)" : "var(--text-muted)" }}
              >
                {r === range && (
                  <motion.span
                    layoutId="range-pill"
                    className="absolute inset-0 rounded-[7px]"
                    style={{ background: "var(--accent)" }}
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  />
                )}
                <span className="relative">{r}</span>
              </button>
            ))}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {OVERLAY_OPTIONS.map((o) => (
              <Chip key={o.id} active={overlays.includes(o.id)} onClick={() => toggle(overlays, o.id, setOverlays)}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: o.color }} />
                {o.label}
              </Chip>
            ))}
            {PANE_OPTIONS.map((p) => (
              <Chip key={p.id} active={panes.includes(p.id)} onClick={() => toggle(panes, p.id, setPanes)}>
                {p.label}
              </Chip>
            ))}
            {panes.includes("rsi") && (
              <Select
                ariaLabel="RSI period"
                className="!w-auto !py-1 !text-[12px]"
                value={rsiPeriod}
                options={RSI_PERIODS.map((p) => ({ value: p, label: `RSI ${p}` }))}
                onChange={(v) => setRsiPeriod(v as number)}
              />
            )}
          </div>
        </div>

        <div className="px-1 pb-1">
          {data.bars.length < 2 ? (
            <p className="px-4 py-10 text-center text-[13px] muted">Not enough price history to draw a chart.</p>
          ) : (
            <CandleChart bars={data.bars} overlays={overlays} panes={panes} rsiPeriod={rsiPeriod} height={430} />
          )}
        </div>

        <p className="border-t px-4 py-2 text-[11px] faint">
          {data.bars.length.toLocaleString()} daily bars shown · indicators are computed from the same code the screener
          uses, so the chart and your screen results always agree.
        </p>
      </section>

      {/* ------------------------------------------- technicals + fundamentals */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card px-4 py-4">
          <h2 className="mb-3 text-[14px] font-semibold">Technical readings</h2>
          {data.metrics ? (
            <>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-0">
                {technicalRows.map((row) => (
                  <div key={row.label} className="flex items-baseline justify-between gap-3 border-b py-2 text-[13px]">
                    <dt className="min-w-0 truncate muted">{row.label}</dt>
                    <dd className={`shrink-0 font-medium tnum ${row.tone ?? ""}`}>{row.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-[11.5px] faint">
                Computed from {data.metrics.barCount.toLocaleString()} daily bars. Readings that need more history than
                that show {NA}.
              </p>
            </>
          ) : (
            <p className="text-[13px] muted">Indicator readings are unavailable for this symbol.</p>
          )}
        </section>

        <section className="card px-4 py-4">
          <h2 className="mb-3 text-[14px] font-semibold">Fundamentals</h2>
          <Fundamentals data={fundamentals} providerLabel={freshness.providerLabel} />
        </section>
      </div>

      <p className="pb-2 text-center text-[11px] leading-relaxed faint">
        Strata is a screening and research tool. Nothing here is a recommendation, a signal, or a forecast.
      </p>
    </div>
  );
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10.5px] font-semibold uppercase tracking-wider faint">{label}</dt>
      <dd className="mt-0.5 font-medium tnum">{value}</dd>
    </div>
  );
}
