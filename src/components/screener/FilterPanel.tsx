"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SECTORS, type Sector } from "@/lib/data/types";
import {
  MARKET_CAP_TIERS,
  UNIVERSE_OPTIONS,
  type BasicFilters,
  type MarketCapTier,
  type UniverseSpec,
} from "@/lib/engine/filters";
import type { Watchlist } from "@/lib/client/store";
import { Chip, Field, NumberInput, Select, Toggle } from "../ui/Primitives";
import { IconChevron } from "../ui/Icons";

/**
 * The basic filters (requirements 3 and 4).
 *
 * Sections collapse so the whole thing fits on a phone without scrolling past
 * filters the user is not using, and each section header shows whether anything
 * inside it is active.
 */

function Section({
  title,
  active,
  defaultOpen = false,
  children,
}: {
  title: string;
  active?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b last:border-b-0">
      <button
        className="flex w-full items-center gap-2 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.16 }} className="faint">
          <IconChevron size={14} />
        </motion.span>
        <span className="text-[13px] font-semibold">{title}</span>
        {active && <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} aria-label="active" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const has = (...vals: unknown[]) => vals.some((v) => v !== undefined && v !== null && v !== "");

export function FilterPanel({
  universe,
  filters,
  watchlists,
  onUniverse,
  onFilters,
}: {
  universe: UniverseSpec;
  filters: BasicFilters;
  watchlists: Watchlist[];
  onUniverse: (next: UniverseSpec) => void;
  onFilters: (next: BasicFilters) => void;
}) {
  const set = (patch: Partial<BasicFilters>) => onFilters({ ...filters, ...patch });

  const toggleTier = (tier: MarketCapTier) => {
    const current = filters.marketCapTiers ?? [];
    const next = current.includes(tier) ? current.filter((t) => t !== tier) : [...current, tier];
    set({ marketCapTiers: next.length ? next : undefined });
  };

  const toggleSector = (sector: Sector) => {
    const current = filters.sectors ?? [];
    const next = current.includes(sector) ? current.filter((s) => s !== sector) : [...current, sector];
    set({ sectors: next.length ? next : undefined });
  };

  return (
    <div className="flex flex-col">
      {/* ------------------------------------------------------- universe */}
      <Section title="Universe" defaultOpen active>
        <div className="flex flex-col gap-3">
          <Select
            ariaLabel="Universe"
            value={universe.scope}
            options={UNIVERSE_OPTIONS.map((o) => ({
              value: o.id,
              label: o.label,
              disabled: o.id === "watchlist" && watchlists.length === 0,
            }))}
            onChange={(scope) => onUniverse({ ...universe, scope, symbols: undefined })}
          />
          <p className="-mt-1 text-[11px] faint">{UNIVERSE_OPTIONS.find((o) => o.id === universe.scope)?.hint}</p>

          {universe.scope === "watchlist" && (
            <Select
              ariaLabel="Which watchlist"
              value={
                watchlists.find((w) => w.symbols.join() === (universe.symbols ?? []).join())?.id ?? watchlists[0]?.id ?? ""
              }
              options={watchlists.map((w) => ({ value: w.id, label: `${w.name} (${w.symbols.length})` }))}
              onChange={(id) => {
                const list = watchlists.find((w) => w.id === id);
                onUniverse({ ...universe, symbols: list?.symbols ?? [] });
              }}
            />
          )}

          <div className="rounded-[10px] border px-3 py-1" style={{ background: "var(--surface-sunken)" }}>
            <Toggle
              label="Include ETFs"
              hint="Off by default so screens return operating companies"
              checked={universe.includeEtfs || universe.scope === "etf"}
              onChange={(v) => onUniverse({ ...universe, includeEtfs: v })}
            />
            <div className="border-t" />
            <Toggle
              label="Exclude low-priced stocks"
              hint={`Drops anything under $${universe.pennyThreshold}`}
              checked={universe.excludePenny}
              onChange={(v) => onUniverse({ ...universe, excludePenny: v })}
            />
            {universe.excludePenny && (
              <div className="flex items-center gap-2 pb-2.5">
                <span className="text-[11px] faint">Minimum price</span>
                <NumberInput
                  ariaLabel="Penny stock threshold"
                  className="!w-[86px]"
                  value={universe.pennyThreshold}
                  onChange={(v) => onUniverse({ ...universe, pennyThreshold: v ?? 5 })}
                />
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------------------- price */}
      <Section title="Price" active={has(filters.priceMin, filters.priceMax)}>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Min">
            <NumberInput value={filters.priceMin} onChange={(v) => set({ priceMin: v })} placeholder="Any" />
          </Field>
          <Field label="Max">
            <NumberInput value={filters.priceMax} onChange={(v) => set({ priceMax: v })} placeholder="Any" />
          </Field>
        </div>
      </Section>

      {/* ----------------------------------------------------- market cap */}
      <Section
        title="Market cap"
        active={Boolean(filters.marketCapTiers?.length) || has(filters.marketCapMin, filters.marketCapMax)}
      >
        <div className="mb-3 flex flex-wrap gap-1.5">
          {MARKET_CAP_TIERS.map((tier) => (
            <Chip
              key={tier.id}
              active={filters.marketCapTiers?.includes(tier.id)}
              onClick={() => toggleTier(tier.id)}
              title={tier.hint}
            >
              {tier.label}
            </Chip>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Custom min ($)" hint="e.g. 2000000000">
            <NumberInput value={filters.marketCapMin} onChange={(v) => set({ marketCapMin: v })} />
          </Field>
          <Field label="Custom max ($)">
            <NumberInput value={filters.marketCapMax} onChange={(v) => set({ marketCapMax: v })} />
          </Field>
        </div>
      </Section>

      {/* --------------------------------------------------------- volume */}
      <Section title="Volume" active={has(filters.avgVolumeMin, filters.volumeMin, filters.dollarVolumeMin)}>
        <div className="flex flex-col gap-2.5">
          <Field label="Min average volume (20d)" hint="Shares per day">
            <NumberInput value={filters.avgVolumeMin} onChange={(v) => set({ avgVolumeMin: v })} placeholder="e.g. 500000" />
          </Field>
          <Field label="Min average dollar volume (20d)">
            <NumberInput value={filters.dollarVolumeMin} onChange={(v) => set({ dollarVolumeMin: v })} placeholder="e.g. 10000000" />
          </Field>
          <Field label="Min volume today">
            <NumberInput value={filters.volumeMin} onChange={(v) => set({ volumeMin: v })} />
          </Field>
        </div>
      </Section>

      {/* --------------------------------------------------------- sector */}
      <Section title="Sector" active={Boolean(filters.sectors?.length)}>
        <div className="flex flex-wrap gap-1.5">
          {SECTORS.filter((s) => s !== "Miscellaneous").map((sector) => (
            <Chip key={sector} active={filters.sectors?.includes(sector)} onClick={() => toggleSector(sector)}>
              {sector}
            </Chip>
          ))}
        </div>
        {filters.sectors?.length ? (
          <button className="btn btn-ghost mt-2 !py-1 text-[12px]" onClick={() => set({ sectors: undefined })}>
            Clear sectors
          </button>
        ) : null}
      </Section>

      {/* --------------------------------------------------- fundamentals */}
      <Section
        title="Fundamentals"
        active={has(
          filters.betaMin,
          filters.betaMax,
          filters.dividendYieldMin,
          filters.dividendYieldMax,
          filters.peMin,
          filters.peMax,
          filters.epsMin,
          filters.epsMax
        ) || (filters.eps && filters.eps !== "any")}
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Beta min">
              <NumberInput value={filters.betaMin} onChange={(v) => set({ betaMin: v })} />
            </Field>
            <Field label="Beta max">
              <NumberInput value={filters.betaMax} onChange={(v) => set({ betaMax: v })} />
            </Field>
            <Field label="Div yield min %">
              <NumberInput value={filters.dividendYieldMin} onChange={(v) => set({ dividendYieldMin: v })} />
            </Field>
            <Field label="Div yield max %">
              <NumberInput value={filters.dividendYieldMax} onChange={(v) => set({ dividendYieldMax: v })} />
            </Field>
            <Field label="P/E min">
              <NumberInput value={filters.peMin} onChange={(v) => set({ peMin: v })} />
            </Field>
            <Field label="P/E max">
              <NumberInput value={filters.peMax} onChange={(v) => set({ peMax: v })} />
            </Field>
          </div>
          <Field label="EPS">
            <Select
              ariaLabel="EPS filter"
              value={filters.eps ?? "any"}
              options={[
                { value: "any", label: "Any" },
                { value: "positive", label: "Positive only" },
                { value: "negative", label: "Negative only" },
              ]}
              onChange={(v) => set({ eps: v as BasicFilters["eps"] })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="EPS min">
              <NumberInput value={filters.epsMin} onChange={(v) => set({ epsMin: v })} />
            </Field>
            <Field label="EPS max">
              <NumberInput value={filters.epsMax} onChange={(v) => set({ epsMax: v })} />
            </Field>
          </div>
          <p className="text-[11px] leading-snug faint">
            Fundamental filters only match symbols where the active data provider actually supplies the figure. Symbols
            with the value missing are excluded rather than assumed.
          </p>
        </div>
      </Section>
    </div>
  );
}
