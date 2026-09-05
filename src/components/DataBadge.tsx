"use client";

import { IconInfo, IconWarn } from "./ui/Icons";
import { freshnessLine, isStale, tradingDaysSince } from "@/lib/client/format";

export interface Freshness {
  provider: string;
  providerLabel: string;
  isDemo: boolean;
  latency: string;
  note: string;
  asOf: number | null;
}

/**
 * The honesty layer (requirements 34 and 35).
 *
 * Demo data is badged loudly and permanently; real data states its provider and
 * whether it is delayed. Nothing in the app renders a price without one of
 * these nearby.
 */
export function DataBadge({ freshness, className = "" }: { freshness: Freshness | null; className?: string }) {
  if (!freshness) return null;

  if (freshness.isDemo) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-wide ${className}`}
        style={{ background: "var(--warn-soft)", color: "var(--warn)", border: "1px solid color-mix(in srgb, var(--warn) 35%, transparent)" }}
        title={freshness.note}
      >
        <IconWarn size={12} />
        DEMO DATA
      </span>
    );
  }

  // End-of-day data being from yesterday's close is normal. Being from last
  // week is not, and saying so is the difference between a dataset that is
  // merely old and one that quietly misleads.
  const stale = isStale(freshness);
  const sessions = freshness.asOf ? tradingDaysSince(freshness.asOf) : 0;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] ${stale ? "" : "faint"} ${className}`}
      style={stale ? { color: "var(--warn)" } : undefined}
      title={stale ? `The most recent session in this data is ${sessions} trading days old.` : freshness.note}
    >
      {stale ? <IconWarn size={12} /> : <IconInfo size={12} />}
      <span className="tnum">{freshnessLine(freshness)}</span>
      <span aria-hidden>·</span>
      <span>{freshness.providerLabel}</span>
      {stale && <span className="font-semibold">· {sessions} sessions behind</span>}
    </span>
  );
}

/** Shown when real data has gone stale, so a screen is never silently wrong. */
export function StaleBanner({ freshness }: { freshness: Freshness | null }) {
  if (!freshness || !isStale(freshness)) return null;
  const sessions = tradingDaysSince(freshness.asOf!);
  return (
    <div
      className="flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-[12px] leading-relaxed"
      style={{ background: "var(--warn-soft)", borderColor: "color-mix(in srgb, var(--warn) 32%, transparent)" }}
    >
      <span style={{ color: "var(--warn)" }} className="mt-[1px] shrink-0">
        <IconWarn size={15} />
      </span>
      <p className="muted">
        <strong style={{ color: "var(--warn)" }}>Data is {sessions} trading sessions behind.</strong> The most recent
        close in this dataset is {new Date(freshness.asOf!).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}.
        Screens still run, but they describe that session rather than today.
      </p>
    </div>
  );
}

/** Full-width strip shown at the top of data-bearing pages when in demo mode. */
export function DemoBanner({ freshness }: { freshness: Freshness | null }) {
  if (!freshness?.isDemo) return null;
  return (
    <div
      className="flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-[12px] leading-relaxed"
      style={{ background: "var(--warn-soft)", borderColor: "color-mix(in srgb, var(--warn) 32%, transparent)" }}
    >
      <span style={{ color: "var(--warn)" }} className="mt-[1px] shrink-0">
        <IconWarn size={15} />
      </span>
      <p className="muted">
        <strong style={{ color: "var(--warn)" }}>Demo data.</strong> Every price, volume and indicator on this screen is
        generated locally from a fixed seed. It is not market data and does not describe any real company.
        {/* The configuration hint is desktop-only: on a phone it pushes the
            actual results below the fold, and nobody edits .env from there. */}
        <span className="hidden sm:inline">
          {" "}Set{" "}
          <code className="rounded px-1 py-0.5 text-[11px]" style={{ background: "var(--surface-sunken)" }}>
            MARKET_DATA_PROVIDER
          </code>{" "}
          to a live provider in{" "}
          <code className="rounded px-1 py-0.5 text-[11px]" style={{ background: "var(--surface-sunken)" }}>
            .env.local
          </code>{" "}
          to screen real markets.
        </span>
      </p>
    </div>
  );
}
