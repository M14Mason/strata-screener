"use client";

import { useMemo, useState } from "react";
import { FIELDS, FIELD_GROUPS, searchFields, type FieldDef, type FieldGroup } from "@/lib/engine/fields";
import { RECIPES, searchRecipes, type ConditionRecipe } from "@/lib/engine/recipes";
import { Sheet } from "../ui/Primitives";
import { IconSearch } from "../ui/Icons";

/**
 * Filter search and condition picker (requirements 23 and 24).
 *
 * Searching returns two kinds of hit:
 *  - *recipes*: a complete, ready-to-use condition ("RSI crossover", "volume
 *    spike", "golden cross"). Typing "rsi" therefore surfaces RSI, RSI
 *    crossover and RSI range rather than a single bare field.
 *  - *fields*: the raw indicator, for building a condition from scratch.
 *
 * Recipes come first because they are what someone searching by intent
 * actually wants; the raw field list is the escape hatch underneath.
 */
export function FieldPicker({
  open,
  onClose,
  onPick,
  onPickRecipe,
  title = "Add a condition",
  recipesEnabled = true,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (field: FieldDef) => void;
  onPickRecipe?: (recipe: ConditionRecipe) => void;
  title?: string;
  recipesEnabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const trimmed = query.trim();

  const recipes = useMemo(() => {
    if (!recipesEnabled || !onPickRecipe) return [];
    // With no query, show a curated starting set rather than all 60 recipes.
    return trimmed ? searchRecipes(trimmed).slice(0, 14) : RECIPES.slice(0, 8);
  }, [trimmed, recipesEnabled, onPickRecipe]);

  const grouped = useMemo(() => {
    const matches = trimmed ? searchFields(trimmed) : FIELDS;
    const byGroup = new Map<FieldGroup, FieldDef[]>();
    for (const field of matches) {
      const list = byGroup.get(field.group) ?? [];
      list.push(field);
      byGroup.set(field.group, list);
    }
    const order = trimmed
      ? [...new Set(matches.map((f) => f.group))]
      : FIELD_GROUPS.filter((g) => byGroup.has(g));
    return order.map((group) => ({ group, fields: byGroup.get(group) ?? [] }));
  }, [trimmed]);

  const fieldCount = grouped.reduce((n, g) => n + g.fields.length, 0);
  const nothing = fieldCount === 0 && recipes.length === 0;

  const close = () => {
    onClose();
    setQuery("");
  };

  return (
    <Sheet open={open} onClose={close} title={title} wide>
      <div className="sticky -top-4 z-10 -mx-5 -mt-4 mb-3 px-5 pb-3 pt-4" style={{ background: "var(--bg-elevated)" }}>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 faint">
            <IconSearch size={15} />
          </span>
          <input
            autoFocus
            className="input !pl-9"
            placeholder="Search filters — try “rsi”, “volume”, “52 week”, “crossover”"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {trimmed && !nothing && (
          <p className="mt-2 text-[11px] faint">
            {recipes.length + fieldCount} {recipes.length + fieldCount === 1 ? "result" : "results"} for “{trimmed}”
          </p>
        )}
      </div>

      {nothing ? (
        <p className="py-8 text-center text-[13px] muted">
          Nothing matches “{trimmed}”. Try a shorter word, like “rsi”, “gap” or “volume”.
        </p>
      ) : (
        <div className="flex flex-col gap-5 pb-2">
          {recipes.length > 0 && onPickRecipe && (
            <section>
              <h3 className="label !mb-2">{trimmed ? "Ready-made conditions" : "Common conditions"}</h3>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {recipes.map((recipe) => (
                  <button
                    key={recipe.id}
                    className="rounded-[10px] border px-3 py-2.5 text-left transition-colors hover:border-[var(--accent-border)]"
                    style={{ background: "var(--accent-soft)", borderColor: "var(--border)" }}
                    onClick={() => {
                      onPickRecipe(recipe);
                      close();
                    }}
                  >
                    <span className="block text-[13px] font-medium">{recipe.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug tnum faint">{recipe.preview}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {fieldCount > 0 && (
            <>
              <div className="flex items-center gap-3">
                <span className="h-px flex-1" style={{ background: "var(--border)" }} />
                <span className="text-[10.5px] font-bold uppercase tracking-wider faint">
                  Or start from a raw indicator
                </span>
                <span className="h-px flex-1" style={{ background: "var(--border)" }} />
              </div>

              {grouped.map(({ group, fields }) => (
                <section key={group}>
                  <h3 className="label !mb-2">{group}</h3>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {fields.map((field) => (
                      <button
                        key={field.id}
                        className="rounded-[10px] border px-3 py-2.5 text-left transition-colors hover:border-[var(--border-strong)]"
                        style={{ background: "var(--surface)" }}
                        onClick={() => {
                          onPick(field);
                          close();
                        }}
                      >
                        <span className="block text-[13px] font-medium">{field.label}</span>
                        {field.description && (
                          <span className="mt-0.5 block line-clamp-2 text-[11px] leading-snug faint">
                            {field.description}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
