"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { countActiveFilters, type BasicFilters, type ScreenRequest, type SortSpec, type UniverseSpec } from "@/lib/engine/filters";
import { countConditions, type Condition, type RuleGroup } from "@/lib/engine/rules";
import { QUICK_SCREENS, PRESET_STRATEGIES, clonePresetRules } from "@/lib/engine/presets";
import type { ScanResponse } from "@/lib/engine/scan";
import { DEFAULT_COLUMNS, defaultScreen, newId, useCopied, useStore } from "@/lib/client/store";
import { downloadText, runScreen } from "@/lib/client/api";
import { DataBadge, DemoBanner, StaleBanner } from "@/components/DataBadge";
import { FilterPanel } from "@/components/screener/FilterPanel";
import { RuleBuilder } from "@/components/screener/RuleBuilder";
import { ResultsTable } from "@/components/screener/ResultsTable";
import { ResultCards } from "@/components/screener/ResultCards";
import { ColumnPicker } from "@/components/screener/ColumnPicker";
import { toCsv } from "@/components/screener/columns";
import { Chip, EmptyState, Field, NumberInput, Sheet, Skeleton } from "@/components/ui/Primitives";
import {
  IconCheck,
  IconCopy,
  IconDownload,
  IconFilter,
  IconPlay,
  IconScreener,
  IconSpinner,
  IconWarn,
} from "@/components/ui/Icons";

/**
 * The screener.
 *
 * Two things shape this page:
 *  - The scan runs on the server, so the client only ever holds the request and
 *    the rows that came back. Changing a filter updates a count, not a 6,000
 *    symbol recompute in the browser.
 *  - Filters live in a left rail on desktop and a bottom sheet on mobile, with
 *    a sticky Scan button that stays in thumb reach.
 */
export default function ScreenerClient() {
  const router = useRouter();
  const params = useSearchParams();
  const { settings, updateSettings, watchlists, strategies, saveStrategy, draft, setDraft, ready } = useStore();
  const { copied, copy } = useCopied();

  const [screen, setScreen] = useState<ScreenRequest>(() => defaultScreen());
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "scanning" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [loadedLabel, setLoadedLabel] = useState<string | null>(null);
  const inflight = useRef<AbortController | null>(null);
  const hydrated = useRef(false);
  const scanButtonVisible = useHideOnScrollDown();

  const rules = screen.rules ?? { kind: "group", id: "root", logic: "all", children: [] };
  const conditionCount = countConditions(rules);
  const filterCount = countActiveFilters(screen.filters);

  // ------------------------------------------------------ load from url/draft
  useEffect(() => {
    if (!ready || hydrated.current) return;
    hydrated.current = true;

    const presetId = params.get("preset");
    const strategyId = params.get("strategy");
    const watchlistSymbols = params.get("symbols");

    if (presetId) {
      const preset = PRESET_STRATEGIES.find((p) => p.id === presetId);
      if (preset) {
        setScreen((s) => ({ ...s, rules: clonePresetRules(preset.rules), filters: preset.filters ?? {} }));
        setLoadedLabel(preset.name);
        return;
      }
    }
    if (strategyId) {
      const saved = strategies.find((s) => s.id === strategyId);
      if (saved) {
        setScreen({ universe: saved.universe, filters: saved.filters, rules: saved.rules, sort: saved.sort, limit: settings.resultLimit });
        setLoadedLabel(saved.name);
        setSaveName(saved.name);
        return;
      }
    }
    if (watchlistSymbols) {
      const symbols = watchlistSymbols.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
      setScreen((s) => ({ ...s, universe: { ...s.universe, scope: "watchlist", symbols, excludePenny: false } }));
      return;
    }
    if (draft) setScreen(draft);
  }, [ready, params, strategies, draft, settings.resultLimit]);

  // Persist the working screen so navigating away and back does not lose it.
  useEffect(() => {
    if (hydrated.current) setDraft(screen);
    // `setDraft` is stable for the life of the provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  // ------------------------------------------------------------------- scan
  const scan = useCallback(
    async (request: ScreenRequest) => {
      inflight.current?.abort();
      const controller = new AbortController();
      inflight.current = controller;
      setStatus("scanning");
      setError(null);
      try {
        const response = await runScreen({ ...request, limit: settings.resultLimit }, controller.signal);
        setResult(response);
        setStatus("idle");
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Scan failed");
        setStatus("error");
      }
    },
    [settings.resultLimit]
  );

  // Run once on arrival so the page is never an empty shell.
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => scan(screen), 60);
    return () => clearTimeout(timer);
    // Intentionally only on first ready: later scans are explicit or debounced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Re-scan automatically when filters change, so the result count stays live
  // (requirement 25) without the user having to press Scan for every tweak.
  const firstAuto = useRef(true);
  useEffect(() => {
    if (!ready) return;
    if (firstAuto.current) {
      firstAuto.current = false;
      return;
    }
    const timer = setTimeout(() => scan(screen), 420);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(screen.filters), JSON.stringify(screen.universe), JSON.stringify(screen.rules)]);

  // Sorting is applied client-side on the rows we already have when possible,
  // and re-requested from the server when the result set was truncated.
  const onSort = (sort: SortSpec) => {
    setScreen((s) => ({ ...s, sort }));
    scan({ ...screen, sort });
  };

  const setFilters = (filters: BasicFilters) => setScreen((s) => ({ ...s, filters }));
  const setUniverse = (universe: UniverseSpec) => setScreen((s) => ({ ...s, universe }));
  const setRules = (next: RuleGroup) => setScreen((s) => ({ ...s, rules: next }));

  const applyQuickScreen = (id: string) => {
    const quick = QUICK_SCREENS.find((q) => q.id === id);
    if (!quick) return;
    setScreen((s) => {
      const nextRules: RuleGroup = quick.conditions
        ? {
            ...(s.rules ?? { kind: "group", id: newId(), logic: "all", children: [] }),
            children: [
              ...(s.rules?.children ?? []),
              ...quick.conditions.map((c): Condition => ({ ...c, id: newId() })),
            ],
          }
        : (s.rules ?? { kind: "group", id: newId(), logic: "all", children: [] });
      return { ...s, rules: nextRules, filters: { ...s.filters, ...(quick.filters ?? {}) } };
    });
    setLoadedLabel(null);
  };

  const clearAll = () => {
    setScreen(defaultScreen());
    setLoadedLabel(null);
    setSaveName("");
  };

  const onSave = () => {
    const name = saveName.trim() || "Untitled screen";
    saveStrategy({
      name,
      rules,
      filters: screen.filters,
      universe: screen.universe,
      sort: screen.sort,
    });
    setSaveOpen(false);
    setLoadedLabel(name);
    router.push("/strategies");
  };

  const exportCsv = () => {
    if (!result?.rows.length) return;
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(`strata-screen-${stamp}.csv`, toCsv(result.rows, settings.columns));
  };

  const rows = result?.rows ?? [];
  const meta = result?.meta;

  const countLabel = useMemo(() => {
    if (status === "scanning" && !meta) return "Scanning…";
    if (!meta) return "";
    const n = meta.matches;
    return `${n.toLocaleString()} ${n === 1 ? "stock matches" : "stocks match"}`;
  }, [meta, status]);

  return (
    <div className="flex min-h-full">
      {/* ------------------------------------------------- desktop filter rail */}
      <aside className="hidden w-[318px] shrink-0 border-r xl:block" style={{ background: "var(--bg-elevated)" }}>
        <div className="sticky top-[58px] max-h-[calc(100dvh-58px)] overflow-y-auto px-4 py-4">
          <FilterRailContent
            screen={screen}
            rules={rules}
            watchlists={watchlists}
            setFilters={setFilters}
            setUniverse={setUniverse}
            setRules={setRules}
          />
        </div>
      </aside>

      {/* ------------------------------------------------------------- results */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-col gap-3 px-4 pb-3 pt-4 md:px-6">
          <DemoBanner freshness={meta?.freshness ?? null} />
      <StaleBanner freshness={meta?.freshness ?? null} />

          {/* quick screens (requirement 22) */}
          <div className="-mx-4 overflow-x-auto px-4 md:-mx-6 md:px-6">
            <div className="flex items-center gap-1.5 pb-1">
              <span className="mr-1 shrink-0 text-[11px] font-bold uppercase tracking-wider faint">Quick screens</span>
              {QUICK_SCREENS.map((quick) => (
                <Chip key={quick.id} onClick={() => applyQuickScreen(quick.id)} title={quick.hint}>
                  {quick.label}
                </Chip>
              ))}
            </div>
          </div>

          {/* result count + actions (requirements 25, 26, 27) */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-0 items-baseline gap-2.5">
              {/*
                Keyed so the number re-animates when it changes, but with a CSS
                entrance rather than a JS one: this is the single most important
                figure on the page and it must never be able to sit at opacity 0
                waiting for an animation frame that a throttled tab is not giving.
              */}
              <h2 key={countLabel} className="animate-rise text-[20px] font-bold tracking-tight tnum">
                {countLabel}
              </h2>
              {status === "scanning" && <IconSpinner size={15} className="faint" />}
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              {/* Export actions are grouped into one segmented control so the
                  toolbar collapses to three tidy blocks on a phone rather than
                  seven loose buttons. */}
              <button className="btn xl:hidden" onClick={() => setFiltersOpen(true)}>
                <IconFilter size={15} />
                Filters
                {(filterCount > 0 || conditionCount > 0) && (
                  <span
                    className="ml-0.5 rounded-full px-1.5 text-[10.5px] font-bold"
                    style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
                  >
                    {filterCount + conditionCount}
                  </span>
                )}
              </button>
              <button className="btn hidden md:inline-flex" onClick={() => setColumnsOpen(true)}>
                Columns
              </button>
              <button className="btn" onClick={clearAll} disabled={filterCount === 0 && conditionCount === 0}>
                Clear all
              </button>
              <span className="inline-flex overflow-hidden rounded-[10px] border">
                <button
                  className="btn !rounded-none !border-0 !border-r"
                  onClick={exportCsv}
                  disabled={!rows.length}
                  title={rows.length ? `Export ${rows.length} rows as CSV` : "Run a scan first"}
                >
                  <IconDownload size={15} />
                  <span className="hidden sm:inline">CSV</span>
                </button>
                <button
                  className="btn !rounded-none !border-0"
                  onClick={() => copy(toCsv(rows, settings.columns))}
                  disabled={!rows.length}
                  title="Copy results to the clipboard"
                  style={copied ? { color: "var(--up)" } : undefined}
                >
                  {copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
                  <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
                </button>
              </span>
              <button className="btn btn-primary" onClick={() => setSaveOpen(true)}>
                Save screen
              </button>
            </div>
          </div>

          {/* scan provenance */}
          {meta && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] faint">
              <DataBadge freshness={meta.freshness} />
              <span className="tnum">
                Scanned {meta.scanned.toLocaleString()} of {meta.eligible.toLocaleString()} eligible symbols
                {meta.universeSize ? ` (universe: ${meta.universeSize.toLocaleString()} listings)` : ""} in{" "}
                {meta.elapsedMs.toLocaleString()}ms
              </span>
              {meta.noData > 0 && <span>· {meta.noData.toLocaleString()} without usable history</span>}
              {meta.returned < meta.matches && (
                <span>
                  · showing the top {meta.returned.toLocaleString()} by {screen.sort.field}
                </span>
              )}
              {loadedLabel && (
                <span className="chip !py-0.5 !text-[10.5px]" data-active="true">
                  {loadedLabel}
                </span>
              )}
            </div>
          )}

          {meta?.truncated && (
            <div
              className="flex items-start gap-2 rounded-xl border px-3 py-2 text-[12px]"
              style={{ background: "var(--warn-soft)", borderColor: "color-mix(in srgb, var(--warn) 30%, transparent)" }}
            >
              <span style={{ color: "var(--warn)" }} className="mt-px shrink-0">
                <IconWarn size={14} />
              </span>
              <p className="muted">
                This scan was capped at {meta.scanned.toLocaleString()} symbols out of {meta.eligible.toLocaleString()}{" "}
                eligible, taking the largest by market cap. Narrow the universe or raise{" "}
                <code className="rounded px-1" style={{ background: "var(--surface-sunken)" }}>SCAN_MAX_SYMBOLS</code> to
                cover more.
              </p>
            </div>
          )}
        </div>

        {/* ------------------------------------------------------------ output */}
        {/* pb-bottom-action clears both the fixed nav and the floating Scan
            button; without it the last result row sits underneath them. */}
        <div className="pb-bottom-action min-w-0 flex-1">
          {status === "error" ? (
            <EmptyState
              title="The scan could not run"
              body={error ?? "Something went wrong."}
              icon={<IconWarn size={26} />}
              action={
                <button className="btn btn-primary" onClick={() => scan(screen)}>
                  Try again
                </button>
              }
            />
          ) : !result && status === "scanning" ? (
            <LoadingRows />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No stocks match this screen"
              body="Nothing in the selected universe satisfies every condition right now. Loosen a threshold, remove a condition, or widen the universe."
              icon={<IconScreener size={26} />}
              action={
                <button className="btn" onClick={clearAll}>
                  Clear all filters
                </button>
              }
            />
          ) : (
            <>
              <div className="hidden md:block">
                <ResultsTable
                  rows={rows}
                  columns={settings.columns}
                  sort={screen.sort}
                  onSort={onSort}
                  hasRules={conditionCount > 0}
                />
              </div>
              <div className="md:hidden">
                <ResultCards rows={rows} hasRules={conditionCount > 0} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ---------------------------------------------- mobile filters + scan */}
      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters & strategy"
        wide
        footer={
          <button
            className="btn btn-primary w-full !py-3 text-[15px]"
            onClick={() => {
              setFiltersOpen(false);
              scan(screen);
            }}
          >
            <IconPlay size={15} />
            Scan market
          </button>
        }
      >
        <FilterRailContent
          screen={screen}
          rules={rules}
          watchlists={watchlists}
          setFilters={setFilters}
          setUniverse={setUniverse}
          setRules={setRules}
        />
      </Sheet>

      {/* Floating scan button on phones (requirement 28).
          It hides while the user scrolls down through results, so it stops
          sitting on top of the rows they are reading, and comes back the moment
          they scroll up or stop. */}
      <div
        className="pointer-events-none fixed inset-x-0 z-30 flex justify-center px-4 xl:hidden"
        style={{ bottom: "calc(var(--bottom-nav-space) + 10px)" }}
      >
        <motion.button
          className={`btn btn-primary !rounded-full !px-5 !py-3 text-[14px] ${scanButtonVisible ? "pointer-events-auto" : "pointer-events-none"}`}
          style={{ boxShadow: "var(--shadow-pop)" }}
          whileTap={{ scale: 0.96 }}
          animate={{ opacity: scanButtonVisible ? 1 : 0, y: scanButtonVisible ? 0 : 24 }}
          aria-hidden={!scanButtonVisible}
          tabIndex={scanButtonVisible ? 0 : -1}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          onClick={() => scan(screen)}
          disabled={status === "scanning"}
        >
          {status === "scanning" ? <IconSpinner size={16} /> : <IconPlay size={15} />}
          {status === "scanning" ? "Scanning…" : "Scan market"}
        </motion.button>
      </div>

      <ColumnPicker
        open={columnsOpen}
        onClose={() => setColumnsOpen(false)}
        columns={settings.columns}
        onChange={(columns) => updateSettings({ columns })}
        onReset={() => updateSettings({ columns: DEFAULT_COLUMNS })}
      />

      <Sheet
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="Save this screen"
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={() => setSaveOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={onSave}>
              Save strategy
            </button>
          </div>
        }
      >
        <Field label="Name" hint="Saved strategies appear on the Strategies page and can be re-run any time.">
          <input
            autoFocus
            className="input"
            placeholder="e.g. My AI RSI Strategy"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSave()}
          />
        </Field>
        <div className="mt-4 rounded-[10px] border px-3 py-2.5 text-[12px]" style={{ background: "var(--surface-sunken)" }}>
          <p className="muted">
            {conditionCount} {conditionCount === 1 ? "condition" : "conditions"} · {filterCount}{" "}
            {filterCount === 1 ? "basic filter" : "basic filters"} · universe: {screen.universe.scope}
          </p>
        </div>
      </Sheet>
    </div>
  );
}

/**
 * True unless the user is actively scrolling down.
 *
 * A floating action button that sits permanently over a scrolling list covers
 * the very rows the list exists to show. Hiding it on downward scroll and
 * restoring it on upward scroll or at rest keeps it reachable without it
 * obscuring content.
 */
function useHideOnScrollDown(threshold = 6): boolean {
  const [visible, setVisible] = useState(true);
  const lastY = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY.current;
      if (Math.abs(delta) > threshold) {
        setVisible(delta < 0 || y < 40);
        lastY.current = y;
      }
      // Bring it back once scrolling stops, so it is never stuck hidden.
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => setVisible(true), 550);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [threshold]);

  return visible;
}

/** Shared between the desktop rail and the mobile sheet so they cannot diverge. */
function FilterRailContent({
  screen,
  rules,
  watchlists,
  setFilters,
  setUniverse,
  setRules,
}: {
  screen: ScreenRequest;
  rules: RuleGroup;
  watchlists: ReturnType<typeof useStore>["watchlists"];
  setFilters: (f: BasicFilters) => void;
  setUniverse: (u: UniverseSpec) => void;
  setRules: (r: RuleGroup) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <section>
        <h2 className="mb-1 text-[13px] font-semibold">Strategy conditions</h2>
        <p className="mb-2.5 text-[11.5px] leading-snug faint">
          Build the technical conditions a stock must satisfy. Leave this empty to screen on the basic filters alone.
        </p>
        <RuleBuilder root={rules} onChange={setRules} />
      </section>

      <section>
        <h2 className="mb-1.5 text-[13px] font-semibold">Basic filters</h2>
        <FilterPanel
          universe={screen.universe}
          filters={screen.filters}
          watchlists={watchlists}
          onUniverse={setUniverse}
          onFilters={setFilters}
        />
      </section>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="flex flex-col gap-2 p-4 md:px-6">
      {Array.from({ length: 10 }).map((_, i) => (
        <Skeleton key={i} className="h-[46px] w-full" />
      ))}
    </div>
  );
}
