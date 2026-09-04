"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Bar } from "@/lib/data/types";
import { bollinger, ema, macd as macdCalc, rollingVwap, rsi as rsiCalc, sma, type Series } from "@/lib/indicators";
import { fmtCompact, fmtPrice } from "@/lib/client/format";

/**
 * Interactive candlestick chart (requirement 17).
 *
 * Drawn on a canvas rather than with an off-the-shelf chart library: the panes
 * (price, volume, RSI, MACD) have to share one time axis and one crosshair, and
 * the app already computes every indicator, so the only thing a library would
 * add is weight and a second source of truth for the maths.
 *
 * Overlays are computed from the same `@/lib/indicators` functions the screener
 * uses, so what the chart draws and what a screen matched on cannot disagree.
 */

export type OverlayId = "sma20" | "sma50" | "sma200" | "ema20" | "bb" | "vwap";
export type PaneId = "volume" | "rsi" | "macd";

export const OVERLAY_OPTIONS: Array<{ id: OverlayId; label: string; color: string }> = [
  { id: "sma20", label: "SMA 20", color: "#60a5fa" },
  { id: "sma50", label: "SMA 50", color: "#fbbf24" },
  { id: "sma200", label: "SMA 200", color: "#c084fc" },
  { id: "ema20", label: "EMA 20", color: "#22d3ee" },
  { id: "bb", label: "Bollinger", color: "#94a3b8" },
  { id: "vwap", label: "VWAP", color: "#f472b6" },
];

export const PANE_OPTIONS: Array<{ id: PaneId; label: string }> = [
  { id: "volume", label: "Volume" },
  { id: "rsi", label: "RSI" },
  { id: "macd", label: "MACD" },
];

interface Theme {
  text: string;
  muted: string;
  faint: string;
  grid: string;
  up: string;
  down: string;
  surface: string;
  accent: string;
}

function readTheme(el: HTMLElement): Theme {
  const s = getComputedStyle(el);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    text: v("--text", "#e8ecf4"),
    muted: v("--text-muted", "#98a2b3"),
    faint: v("--text-faint", "#667085"),
    grid: v("--border", "#232a35"),
    up: v("--up", "#34d399"),
    down: v("--down", "#fb7185"),
    surface: v("--surface", "#14181f"),
    accent: v("--accent", "#7b8cff"),
  };
}

export function CandleChart({
  bars,
  overlays,
  panes,
  rsiPeriod = 14,
  height = 460,
}: {
  bars: Bar[];
  overlays: OverlayId[];
  panes: PaneId[];
  rsiPeriod?: number;
  height?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 800, height });
  const [hover, setHover] = useState<number | null>(null);

  // Indicators are derived once per bar set, not per frame.
  const series = useMemo(() => {
    const close = bars.map((b) => b.c);
    const high = bars.map((b) => b.h);
    const low = bars.map((b) => b.l);
    const volume = bars.map((b) => b.v);
    const bb = bollinger(close, 20, 2);
    const macd = macdCalc(close, 12, 26, 9);
    return {
      close,
      high,
      low,
      volume,
      sma20: sma(close, 20),
      sma50: sma(close, 50),
      sma200: sma(close, 200),
      ema20: ema(close, 20),
      bbUpper: bb.upper,
      bbLower: bb.lower,
      bbMiddle: bb.middle,
      vwap: rollingVwap(high, low, close, volume, 20),
      rsi: rsiCalc(close, rsiPeriod),
      macd: macd.macd,
      macdSignal: macd.signal,
      macdHist: macd.histogram,
    };
  }, [bars, rsiPeriod]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: Math.max(320, entry.contentRect.width), height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || bars.length < 2) return;

    const theme = readTheme(wrap);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);

    draw(ctx, { bars, series, overlays, panes, theme, width: size.width, height: size.height, hover, rsiPeriod });
  }, [bars, series, overlays, panes, size, hover, rsiPeriod]);

  const barAt = (clientX: number): number | null => {
    const canvas = canvasRef.current;
    if (!canvas || bars.length === 0) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left - PADDING.left;
    const plotWidth = size.width - PADDING.left - PADDING.right;
    if (x < 0 || x > plotWidth) return null;
    const index = Math.round((x / plotWidth) * (bars.length - 1));
    return Math.max(0, Math.min(bars.length - 1, index));
  };

  const hovered = hover != null ? bars[hover] : null;

  return (
    <div ref={wrapRef} className="relative w-full select-none">
      <canvas
        ref={canvasRef}
        className="block w-full touch-pan-y"
        onMouseMove={(e) => setHover(barAt(e.clientX))}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => setHover(barAt(e.touches[0].clientX))}
        onTouchMove={(e) => setHover(barAt(e.touches[0].clientX))}
        onTouchEnd={() => setHover(null)}
        role="img"
        aria-label={`Candlestick chart of ${bars.length} daily bars`}
      />
      {hovered && (
        <div
          className="pointer-events-none absolute left-2 top-2 rounded-lg border px-2.5 py-1.5 text-[11px] leading-relaxed tnum"
          style={{ background: "color-mix(in srgb, var(--bg-elevated) 94%, transparent)", boxShadow: "var(--shadow-pop)" }}
        >
          <div className="mb-0.5 font-semibold">
            {new Date(hovered.t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
          </div>
          <div className="flex gap-3 muted">
            <span>O {fmtPrice(hovered.o)}</span>
            <span>H {fmtPrice(hovered.h)}</span>
            <span>L {fmtPrice(hovered.l)}</span>
            <span style={{ color: hovered.c >= hovered.o ? "var(--up)" : "var(--down)" }}>C {fmtPrice(hovered.c)}</span>
          </div>
          <div className="faint">Vol {fmtCompact(hovered.v)}</div>
        </div>
      )}
    </div>
  );
}

const PADDING = { left: 8, right: 62, top: 12, bottom: 22 };
const PANE_GAP = 10;

interface DrawArgs {
  bars: Bar[];
  series: Record<string, Series | number[]>;
  overlays: OverlayId[];
  panes: PaneId[];
  theme: Theme;
  width: number;
  height: number;
  hover: number | null;
  rsiPeriod: number;
}

function draw(ctx: CanvasRenderingContext2D, args: DrawArgs) {
  const { bars, series, overlays, panes, theme, width, height, hover } = args;

  const plotWidth = width - PADDING.left - PADDING.right;
  // The price pane keeps the lion's share; each sub-pane gets a fixed slice.
  const subHeight = 74;
  const subTotal = panes.length * (subHeight + PANE_GAP);
  const priceHeight = Math.max(120, height - PADDING.top - PADDING.bottom - subTotal);

  const n = bars.length;
  const xAt = (i: number) => PADDING.left + (n === 1 ? plotWidth / 2 : (i / (n - 1)) * plotWidth);
  const barWidth = Math.max(1, Math.min(11, (plotWidth / n) * 0.68));

  ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
  ctx.textBaseline = "middle";

  // ------------------------------------------------------------- price pane
  const priceTop = PADDING.top;
  const priceBottom = priceTop + priceHeight;

  let lo = Infinity;
  let hi = -Infinity;
  for (const b of bars) {
    if (b.l < lo) lo = b.l;
    if (b.h > hi) hi = b.h;
  }
  // Overlays can travel outside the price range (Bollinger bands especially).
  const overlaySeries: Array<{ id: OverlayId; key: string; color: string; dashed?: boolean }> = [];
  for (const opt of OVERLAY_OPTIONS) {
    if (!overlays.includes(opt.id)) continue;
    if (opt.id === "bb") {
      overlaySeries.push({ id: "bb", key: "bbUpper", color: opt.color, dashed: true });
      overlaySeries.push({ id: "bb", key: "bbLower", color: opt.color, dashed: true });
      overlaySeries.push({ id: "bb", key: "bbMiddle", color: opt.color, dashed: true });
    } else {
      overlaySeries.push({ id: opt.id, key: opt.id === "vwap" ? "vwap" : opt.id, color: opt.color });
    }
  }
  for (const o of overlaySeries) {
    for (const v of (series[o.key] ?? []) as Series) {
      if (v == null) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }

  const pad = (hi - lo) * 0.06 || 1;
  lo -= pad;
  hi += pad;
  const yPrice = (v: number) => priceBottom - ((v - lo) / (hi - lo || 1)) * priceHeight;

  // grid + right-hand price scale
  ctx.strokeStyle = theme.grid;
  ctx.fillStyle = theme.faint;
  ctx.lineWidth = 1;
  ctx.textAlign = "left";
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const value = lo + ((hi - lo) * i) / ticks;
    const y = Math.round(yPrice(value)) + 0.5;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(PADDING.left, y);
    ctx.lineTo(PADDING.left + plotWidth, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillText(fmtPrice(value), PADDING.left + plotWidth + 6, y);
  }

  // candles
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const x = xAt(i);
    const rising = b.c >= b.o;
    const color = rising ? theme.up : theme.down;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, yPrice(b.h));
    ctx.lineTo(Math.round(x) + 0.5, yPrice(b.l));
    ctx.lineWidth = 1;
    ctx.stroke();

    const yOpen = yPrice(b.o);
    const yClose = yPrice(b.c);
    const top = Math.min(yOpen, yClose);
    const bodyHeight = Math.max(1, Math.abs(yClose - yOpen));
    if (barWidth <= 1.6) {
      // Too dense for bodies: a 1px column reads better than a smear.
      ctx.fillRect(Math.round(x), top, 1, bodyHeight);
    } else {
      ctx.fillRect(Math.round(x - barWidth / 2), top, Math.round(barWidth), bodyHeight);
    }
  }

  // overlays
  for (const o of overlaySeries) {
    strokeSeries(ctx, (series[o.key] ?? []) as Series, xAt, yPrice, o.color, o.dashed);
  }

  // ------------------------------------------------------------- sub panes
  let top = priceBottom + PANE_GAP;
  for (const pane of panes) {
    const bottom = top + subHeight;
    ctx.strokeStyle = theme.grid;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(PADDING.left, Math.round(top) + 0.5);
    ctx.lineTo(PADDING.left + plotWidth, Math.round(top) + 0.5);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = theme.faint;
    ctx.textAlign = "left";

    if (pane === "volume") {
      const vols = series.volume as number[];
      const maxVol = Math.max(...vols, 1);
      for (let i = 0; i < n; i++) {
        const h = (vols[i] / maxVol) * (subHeight - 12);
        ctx.fillStyle = bars[i].c >= bars[i].o ? theme.up : theme.down;
        ctx.globalAlpha = 0.5;
        ctx.fillRect(Math.round(xAt(i) - barWidth / 2), bottom - h, Math.max(1, Math.round(barWidth)), h);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = theme.faint;
      ctx.fillText("Volume", PADDING.left + 4, top + 9);
      ctx.textAlign = "left";
      ctx.fillText(fmtCompact(maxVol), PADDING.left + plotWidth + 6, top + 9);
    }

    if (pane === "rsi") {
      const yRsi = (v: number) => bottom - (v / 100) * (subHeight - 8) - 4;
      // 30 / 70 reference lines are the conventional read for RSI.
      ctx.strokeStyle = theme.grid;
      ctx.setLineDash([3, 3]);
      for (const level of [30, 70]) {
        ctx.beginPath();
        ctx.moveTo(PADDING.left, yRsi(level));
        ctx.lineTo(PADDING.left + plotWidth, yRsi(level));
        ctx.stroke();
      }
      ctx.setLineDash([]);
      strokeSeries(ctx, series.rsi as Series, xAt, yRsi, theme.accent);
      ctx.fillStyle = theme.faint;
      ctx.fillText(`RSI(${args.rsiPeriod})`, PADDING.left + 4, top + 9);
      ctx.fillText("70", PADDING.left + plotWidth + 6, yRsi(70));
      ctx.fillText("30", PADDING.left + plotWidth + 6, yRsi(30));
    }

    if (pane === "macd") {
      const values = [
        ...((series.macd as Series) ?? []),
        ...((series.macdSignal as Series) ?? []),
        ...((series.macdHist as Series) ?? []),
      ].filter((v): v is number => v != null);
      const extent = Math.max(...values.map(Math.abs), 0.0001);
      const yMacd = (v: number) => top + subHeight / 2 - (v / extent) * (subHeight / 2 - 6);

      const hist = (series.macdHist as Series) ?? [];
      for (let i = 0; i < n; i++) {
        const v = hist[i];
        if (v == null) continue;
        ctx.fillStyle = v >= 0 ? theme.up : theme.down;
        ctx.globalAlpha = 0.45;
        const zero = yMacd(0);
        const y = yMacd(v);
        ctx.fillRect(Math.round(xAt(i) - barWidth / 2), Math.min(zero, y), Math.max(1, Math.round(barWidth)), Math.abs(zero - y));
      }
      ctx.globalAlpha = 1;
      strokeSeries(ctx, (series.macd as Series) ?? [], xAt, yMacd, theme.accent);
      strokeSeries(ctx, (series.macdSignal as Series) ?? [], xAt, yMacd, "#fbbf24");
      ctx.fillStyle = theme.faint;
      ctx.fillText("MACD 12 / 26 / 9", PADDING.left + 4, top + 9);
    }

    top = bottom + PANE_GAP;
  }

  // -------------------------------------------------------------- time axis
  ctx.fillStyle = theme.faint;
  ctx.textAlign = "center";
  const labelCount = Math.max(2, Math.min(7, Math.floor(plotWidth / 110)));
  for (let i = 0; i < labelCount; i++) {
    const index = Math.round((i / (labelCount - 1)) * (n - 1));
    const date = new Date(bars[index].t);
    const label =
      n > 400
        ? date.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" })
        : date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    let x = xAt(index);
    x = Math.max(PADDING.left + 24, Math.min(PADDING.left + plotWidth - 24, x));
    ctx.fillText(label, x, height - 9);
  }

  // --------------------------------------------------------------- crosshair
  if (hover != null && hover >= 0 && hover < n) {
    const x = Math.round(xAt(hover)) + 0.5;
    ctx.strokeStyle = theme.muted;
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, PADDING.top);
    ctx.lineTo(x, height - PADDING.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    const y = yPrice(bars[hover].c);
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.arc(x, y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function strokeSeries(
  ctx: CanvasRenderingContext2D,
  values: Series,
  xAt: (i: number) => number,
  yAt: (v: number) => number,
  color: string,
  dashed = false
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.lineJoin = "round";
  if (dashed) ctx.setLineDash([4, 3]);
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) {
      started = false;
      continue;
    }
    const x = xAt(i);
    const y = yAt(v);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  if (dashed) ctx.setLineDash([]);
}
