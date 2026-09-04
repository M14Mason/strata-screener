"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { PRESET_STRATEGIES, STRATEGY_CATEGORIES, clonePresetRules, type StrategyCategory } from "@/lib/engine/presets";
import { countConditions, summarizeRules } from "@/lib/engine/rules";
import { DEFAULT_UNIVERSE, DEFAULT_SORT } from "@/lib/engine/filters";
import { useStore } from "@/lib/client/store";
import { Chip, ConfirmButton, EmptyState, Field, Sheet } from "@/components/ui/Primitives";
import { IconCopy, IconEdit, IconPlay, IconPlus, IconStrategy, IconTrash } from "@/components/ui/Icons";

/**
 * Strategies page: saved strategies plus the prebuilt library
 * (requirements 20 and 21).
 *
 * Every library entry can be copied into a private, editable strategy -- the
 * copy gets fresh ids so editing it never mutates the library.
 */
export default function StrategiesClient() {
  const router = useRouter();
  const { strategies, saveStrategy, renameStrategy, duplicateStrategy, deleteStrategy, ready } = useStore();
  const [tab, setTab] = useState<"mine" | "library">("mine");
  const [category, setCategory] = useState<StrategyCategory | "all">("all");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  const library = useMemo(
    () => (category === "all" ? PRESET_STRATEGIES : PRESET_STRATEGIES.filter((p) => p.category === category)),
    [category]
  );

  const copyPreset = (presetId: string) => {
    const preset = PRESET_STRATEGIES.find((p) => p.id === presetId);
    if (!preset) return;
    const saved = saveStrategy({
      name: preset.name,
      description: preset.description,
      rules: clonePresetRules(preset.rules),
      filters: preset.filters ?? {},
      universe: { ...DEFAULT_UNIVERSE },
      sort: { ...DEFAULT_SORT },
      basedOn: preset.id,
    });
    router.push(`/screener?strategy=${saved.id}`);
  };

  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:px-6 md:py-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-[10px] border p-0.5" style={{ background: "var(--surface-sunken)" }}>
          {(["mine", "library"] as const).map((id) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="relative rounded-[8px] px-3.5 py-1.5 text-[13px] font-semibold transition-colors"
              style={{ color: tab === id ? "var(--accent-contrast)" : "var(--text-muted)" }}
            >
              {tab === id && (
                <motion.span
                  layoutId="strategy-tab"
                  className="absolute inset-0 rounded-[8px]"
                  style={{ background: "var(--accent)" }}
                  transition={{ type: "spring", stiffness: 500, damping: 38 }}
                />
              )}
              <span className="relative">
                {id === "mine" ? `Saved${strategies.length ? ` (${strategies.length})` : ""}` : "Library"}
              </span>
            </button>
          ))}
        </div>
        <Link href="/screener" className="btn btn-primary ml-auto">
          <IconPlus size={15} />
          New strategy
        </Link>
      </div>

      {/*
        Rendered directly rather than through AnimatePresence mode="wait".
        "wait" holds the incoming panel until the outgoing one finishes exiting,
        so a throttled animation frame loop (a background tab, reduced power
        mode) leaves the user looking at the panel they just navigated away
        from. A keyed CSS entrance cannot get stuck that way.
      */}
      <div key={tab} className="animate-rise">
        {tab === "mine" ? (
          <div>
            {!ready ? null : strategies.length === 0 ? (
              <div className="card">
                <EmptyState
                  title="No saved strategies"
                  body="Build a screen and press Save screen, or copy one from the library to get a starting point you can edit."
                  icon={<IconStrategy size={26} />}
                  action={
                    <div className="flex flex-wrap justify-center gap-2">
                      <Link href="/screener" className="btn btn-primary">
                        Build a screen
                      </Link>
                      <button className="btn" onClick={() => setTab("library")}>
                        Browse the library
                      </button>
                    </div>
                  }
                />
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {strategies.map((strategy) => (
                  <article key={strategy.id} className="card flex flex-col px-4 py-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="min-w-0 text-[14.5px] font-semibold">{strategy.name}</h3>
                      <span className="chip shrink-0 !py-0.5 !text-[10.5px]">
                        {countConditions(strategy.rules)} cond
                      </span>
                    </div>
                    {strategy.basedOn && (
                      <p className="mt-0.5 text-[11px] faint">
                        Based on {PRESET_STRATEGIES.find((p) => p.id === strategy.basedOn)?.name ?? strategy.basedOn}
                      </p>
                    )}

                    <ul className="mt-2.5 flex flex-1 flex-col gap-1">
                      {summarizeRules(strategy.rules).map((line, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[11.5px] leading-snug tnum muted">
                          <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
                          {line}
                        </li>
                      ))}
                      {countConditions(strategy.rules) === 0 && (
                        <li className="text-[11.5px] faint">Basic filters only — no technical conditions.</li>
                      )}
                    </ul>

                    <div className="mt-3 flex flex-wrap items-center gap-1 border-t pt-2.5">
                      <Link href={`/screener?strategy=${strategy.id}`} className="btn !py-1.5 text-[12.5px]">
                        <IconPlay size={13} />
                        Run
                      </Link>
                      <Link href={`/screener?strategy=${strategy.id}`} className="btn btn-ghost !px-2 !py-1.5" aria-label="Edit">
                        <IconEdit size={14} />
                      </Link>
                      <button
                        className="btn btn-ghost !px-2 !py-1.5"
                        onClick={() => setRenaming({ id: strategy.id, name: strategy.name })}
                        aria-label="Rename"
                      >
                        <span className="text-[12px]">Rename</span>
                      </button>
                      <button
                        className="btn btn-ghost !px-2 !py-1.5"
                        onClick={() => duplicateStrategy(strategy.id)}
                        aria-label="Duplicate"
                      >
                        <IconCopy size={14} />
                      </button>
                      <ConfirmButton
                        className="btn btn-danger !ml-auto !px-2 !py-1.5"
                        onConfirm={() => deleteStrategy(strategy.id)}
                        label={`Delete ${strategy.name}`}
                        confirmLabel="Sure?"
                      >
                        <IconTrash size={14} />
                      </ConfirmButton>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5">
              <Chip active={category === "all"} onClick={() => setCategory("all")}>
                All
              </Chip>
              {STRATEGY_CATEGORIES.map((c) => (
                <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
                  {c}
                </Chip>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {library.map((preset) => (
                <article key={preset.id} className="card flex flex-col px-4 py-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="min-w-0 text-[14.5px] font-semibold">{preset.name}</h3>
                    <span className="chip shrink-0 !py-0.5 !text-[10.5px]">{preset.category}</span>
                  </div>
                  <p className="mt-1.5 text-[12px] leading-relaxed muted">{preset.description}</p>

                  <ul className="mt-2.5 flex flex-1 flex-col gap-1 border-t pt-2.5">
                    {summarizeRules(preset.rules).map((line, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[11.5px] leading-snug tnum faint">
                        <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
                        {line}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-3 flex items-center gap-1.5 border-t pt-2.5">
                    <Link href={`/screener?preset=${preset.id}`} className="btn btn-primary !py-1.5 text-[12.5px]">
                      <IconPlay size={13} />
                      Run screen
                    </Link>
                    <button className="btn !py-1.5 text-[12.5px]" onClick={() => copyPreset(preset.id)}>
                      <IconCopy size={13} />
                      Copy &amp; customise
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <p className="px-1 py-2 text-[11.5px] leading-relaxed faint">
              These are screening strategies, not trading signals. Each one describes a set of conditions that are true
              right now; none of them predicts what a stock will do next.
            </p>
          </div>
        )}
      </div>

      <Sheet
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Rename strategy"
        footer={
          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={() => setRenaming(null)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                if (renaming?.name.trim()) renameStrategy(renaming.id, renaming.name.trim());
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
            onKeyDown={(e) => {
              if (e.key !== "Enter" || !renaming?.name.trim()) return;
              renameStrategy(renaming.id, renaming.name.trim());
              setRenaming(null);
            }}
          />
        </Field>
      </Sheet>
    </div>
  );
}
