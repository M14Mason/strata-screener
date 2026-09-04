"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import {
  OPERATORS,
  fieldLabel,
  lookupField,
  type FieldDef,
  type OperatorId,
} from "@/lib/engine/fields";
import {
  GROUP_LOGIC_LABEL,
  MAX_LOOKBACK_DAYS,
  type Condition,
  type GroupLogic,
  type RuleGroup,
  type RuleNode,
  type Timing,
} from "@/lib/engine/rules";
import { newId } from "@/lib/client/store";
import { NumberInput, Select } from "../ui/Primitives";
import { FieldPicker } from "./FieldPicker";
import type { ConditionRecipe } from "@/lib/engine/recipes";
import { IconGroup, IconPlus, IconTrash } from "../ui/Icons";

/**
 * The no-code condition builder (requirements 9, 10, 11, 23).
 *
 * Every condition reads left to right as a sentence -- INDICATOR / PERIOD /
 * CONDITION / VALUE / WHEN -- because that is the shape a beginner can fill in
 * without knowing any syntax. Groups nest, and each group states its logic in
 * words ("ALL of these", "ANY of these") rather than as an operator symbol.
 */

const CUSTOM = -1;

export function RuleBuilder({
  root,
  onChange,
}: {
  root: RuleGroup;
  onChange: (next: RuleGroup) => void;
}) {
  return <GroupEditor node={root} onChange={onChange} depth={0} onRemove={null} />;
}

// --------------------------------------------------------------- tree helpers

function replaceChild(group: RuleGroup, index: number, next: RuleNode): RuleGroup {
  const children = [...group.children];
  children[index] = next;
  return { ...group, children };
}

function makeFromRecipe(recipe: ConditionRecipe): Condition {
  return {
    kind: "condition",
    id: newId(),
    field: recipe.field,
    period: recipe.period,
    op: recipe.op,
    value: recipe.value,
    value2: recipe.value2,
    ref: recipe.ref,
    timing: { mode: "today" },
  };
}

function makeCondition(field: FieldDef): Condition {
  const op = field.operators[0] as OperatorId;
  const needsRef = field.id === "price" || field.id === "sma" || field.id === "ema";
  return {
    kind: "condition",
    id: newId(),
    field: field.id,
    period: field.defaultPeriod,
    op,
    // Price and moving averages are almost always compared to another moving
    // average, so that is what a fresh condition starts as.
    ref: needsRef && field.id === "price" ? { field: "sma", period: 200 } : undefined,
    value: needsRef && field.id === "price" ? undefined : (field.defaultValue ?? 0),
    value2: op === "withinPct" ? 1 : undefined,
    timing: { mode: "today" },
  };
}

// ------------------------------------------------------------------ group UI

function GroupEditor({
  node,
  onChange,
  onRemove,
  depth,
}: {
  node: RuleGroup;
  onChange: (next: RuleGroup) => void;
  onRemove: (() => void) | null;
  depth: number;
}) {
  const [picking, setPicking] = useState(false);

  const addCondition = (field: FieldDef) =>
    onChange({ ...node, children: [...node.children, makeCondition(field)] });

  const addRecipe = (recipe: ConditionRecipe) =>
    onChange({ ...node, children: [...node.children, makeFromRecipe(recipe)] });

  const addGroup = () =>
    onChange({
      ...node,
      children: [...node.children, { kind: "group", id: newId(), logic: "any", children: [] }],
    });

  const removeAt = (index: number) =>
    onChange({ ...node, children: node.children.filter((_, i) => i !== index) });

  return (
    <div
      className="rounded-[13px] border"
      style={{
        background: depth === 0 ? "transparent" : "var(--surface-sunken)",
        borderColor: depth === 0 ? "var(--border)" : "var(--border-strong)",
        borderStyle: depth === 0 ? "solid" : "dashed",
      }}
    >
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5" style={{ borderColor: "inherit" }}>
        <LogicSelector logic={node.logic} onChange={(logic) => onChange({ ...node, logic })} />
        <span className="text-[11.5px] faint">
          {node.children.length === 0
            ? "no conditions yet"
            : `${node.children.length} ${node.children.length === 1 ? "condition" : "conditions"}`}
        </span>
        {onRemove && (
          <button className="btn btn-ghost !ml-auto !px-2 !py-1.5" onClick={onRemove} aria-label="Remove group">
            <IconTrash size={15} />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2 p-2.5">
        <AnimatePresence initial={false}>
          {node.children.map((child, index) => (
            <motion.div
              key={child.id}
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginTop: -8 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              {child.kind === "group" ? (
                <GroupEditor
                  node={child}
                  depth={depth + 1}
                  onChange={(next) => onChange(replaceChild(node, index, next))}
                  onRemove={() => removeAt(index)}
                />
              ) : (
                <ConditionEditor
                  condition={child}
                  logic={node.logic}
                  onChange={(next) => onChange(replaceChild(node, index, next))}
                  onRemove={() => removeAt(index)}
                />
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        <div className="flex flex-wrap gap-2">
          <button className="btn !py-2 text-[13px]" onClick={() => setPicking(true)}>
            <IconPlus size={15} /> Add condition
          </button>
          {depth < 2 && (
            <button className="btn btn-ghost !py-2 text-[13px]" onClick={addGroup}>
              <IconGroup size={15} /> Add condition group
            </button>
          )}
        </div>
      </div>

      <FieldPicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={addCondition}
        onPickRecipe={addRecipe}
      />
    </div>
  );
}

const LOGIC_OPTIONS: GroupLogic[] = ["all", "any", "none"];

function LogicSelector({ logic, onChange }: { logic: GroupLogic; onChange: (l: GroupLogic) => void }) {
  // One id per selector instance so the sliding pill animates inside its own
  // group rather than flying between nested groups.
  const [pillId] = useState(() => `logic-${Math.random().toString(36).slice(2, 8)}`);
  return (
    <div className="inline-flex rounded-[9px] border p-0.5" style={{ background: "var(--surface-sunken)" }}>
      {LOGIC_OPTIONS.map((option) => {
        const active = option === logic;
        return (
          <button
            key={option}
            onClick={() => onChange(option)}
            className="relative rounded-[7px] px-2.5 py-1 text-[11.5px] font-semibold uppercase tracking-wide transition-colors"
            style={{ color: active ? "var(--accent-contrast)" : "var(--text-muted)" }}
            title={GROUP_LOGIC_LABEL[option]}
          >
            {active && (
              <motion.span
                layoutId={pillId}
                className="absolute inset-0 rounded-[7px]"
                style={{ background: "var(--accent)" }}
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative">{option === "all" ? "AND" : option === "any" ? "OR" : "NOT"}</span>
          </button>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------------- condition UI

function ConditionEditor({
  condition,
  logic,
  onChange,
  onRemove,
}: {
  condition: Condition;
  logic: GroupLogic;
  onChange: (next: Condition) => void;
  onRemove: () => void;
}) {
  const field = lookupField(condition.field);
  const [customPeriod, setCustomPeriod] = useState(
    field?.periods && condition.period != null && !field.periods.includes(condition.period)
  );
  const [refPicker, setRefPicker] = useState(false);

  if (!field) return null;

  const operator = OPERATORS[condition.op];
  const compareToRef = Boolean(condition.ref);
  const refField = condition.ref ? lookupField(condition.ref.field) : undefined;

  const set = (patch: Partial<Condition>) => onChange({ ...condition, ...patch });

  return (
    <div
      className="@container rounded-[11px] border px-2.5 py-2.5"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold"
          style={{
            background: logic === "any" ? "transparent" : "var(--accent-soft)",
            border: `1px solid ${logic === "any" ? "var(--border-strong)" : "var(--accent-border)"}`,
            color: "var(--accent)",
          }}
          aria-hidden
        >
          {logic === "any" ? "" : logic === "none" ? "✕" : "✓"}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">
          {condition.not && <span className="mr-1 font-bold" style={{ color: "var(--down)" }}>NOT</span>}
          {fieldLabel(condition.field, condition.period)}
        </span>
        <button
          className="btn btn-ghost !px-1.5 !py-1"
          onClick={() => set({ not: !condition.not })}
          title="Invert this condition"
          style={{ color: condition.not ? "var(--down)" : undefined }}
        >
          <span className="text-[10.5px] font-bold tracking-wide">NOT</span>
        </button>
        <button className="btn btn-ghost !px-1.5 !py-1" onClick={onRemove} aria-label="Remove condition">
          <IconTrash size={14} />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 @[300px]:grid-cols-2 @[680px]:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
        {/* ---- period ---- */}
        {field.periods && (
          <div>
            <span className="label">Period</span>
            {customPeriod ? (
              <NumberInput
                ariaLabel="Custom period"
                value={condition.period}
                min={1}
                max={400}
                onChange={(v) => set({ period: v })}
              />
            ) : (
              <Select
                ariaLabel="Period"
                value={condition.period ?? field.defaultPeriod ?? field.periods[0]}
                options={[
                  ...field.periods.map((p) => ({ value: p, label: String(p) })),
                  ...(field.allowCustomPeriod ? [{ value: CUSTOM, label: "Custom…" }] : []),
                ]}
                onChange={(v) => {
                  if (v === CUSTOM) setCustomPeriod(true);
                  else set({ period: v as number });
                }}
              />
            )}
          </div>
        )}

        {/* ---- operator ---- */}
        <div>
          <span className="label">Condition</span>
          <Select
            ariaLabel="Condition"
            value={condition.op}
            options={field.operators.map((id) => ({ value: id, label: OPERATORS[id].label }))}
            onChange={(op) => {
              const next = OPERATORS[op as OperatorId];
              set({
                op: op as OperatorId,
                value2: op === "withinPct" ? (condition.value2 ?? 1) : op === "between" ? condition.value2 : undefined,
                ref: next.allowsRef ? condition.ref : undefined,
                value: next.operands === 0 ? undefined : (condition.value ?? field.defaultValue ?? 0),
              });
            }}
          />
        </div>

        {/* ---- right-hand side ---- */}
        {operator.operands > 0 && (
          <div className="@[300px]:col-span-2 @[680px]:col-span-1">
            <span className="label">
              {operator.allowsRef ? "Compared to" : operator.id === "between" ? "From" : "Value"}
            </span>
            {operator.allowsRef ? (
              <div className="flex flex-col gap-1.5 @[200px]:flex-row">
                <Select
                  ariaLabel="Compare to"
                  className="!flex-1"
                  value={compareToRef ? "ref" : "value"}
                  options={[
                    { value: "value", label: "a number" },
                    { value: "ref", label: "an indicator" },
                  ]}
                  onChange={(mode) => {
                    if (mode === "ref") set({ ref: { field: "sma", period: 200 }, value: undefined });
                    else set({ ref: undefined, value: field.defaultValue ?? 0 });
                  }}
                />
                {compareToRef ? (
                  <button className="btn !flex-1 !px-2 text-[12.5px]" onClick={() => setRefPicker(true)}>
                    <span className="truncate">
                      {refField ? fieldLabel(condition.ref!.field, condition.ref!.period) : "Pick"}
                    </span>
                  </button>
                ) : (
                  <NumberInput
                    ariaLabel="Value"
                    className="!flex-1"
                    value={condition.value}
                    onChange={(v) => set({ value: v })}
                  />
                )}
              </div>
            ) : (
              <NumberInput ariaLabel="Value" value={condition.value} onChange={(v) => set({ value: v })} />
            )}
          </div>
        )}

        {/* second operand: "between" upper bound, or "within X%" tolerance */}
        {operator.operands === 2 && (
          <div>
            <span className="label">{condition.op === "withinPct" ? "Tolerance %" : "To"}</span>
            <NumberInput
              ariaLabel={condition.op === "withinPct" ? "Tolerance percent" : "Upper bound"}
              value={condition.value2}
              onChange={(v) => set({ value2: v })}
            />
          </div>
        )}

        {/* ---- timing ---- */}
        <div className="@[300px]:col-span-2 @[680px]:col-span-1">
          <span className="label">When</span>
          <TimingEditor timing={condition.timing} onChange={(timing) => set({ timing })} />
        </div>
      </div>

      {/* Period picker for the right-hand indicator. */}
      <FieldPicker
        open={refPicker}
        onClose={() => setRefPicker(false)}
        title="Compare against which indicator?"
        recipesEnabled={false}
        onPick={(picked) => set({ ref: { field: picked.id, period: picked.defaultPeriod } })}
      />

      {compareToRef && refField?.periods && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[11px] faint">{refField.label} period</span>
          <Select
            ariaLabel="Reference period"
            className="!w-auto !py-1 !text-[12.5px]"
            value={condition.ref?.period ?? refField.defaultPeriod ?? refField.periods[0]}
            options={refField.periods.map((p) => ({ value: p, label: String(p) }))}
            onChange={(p) => set({ ref: { field: condition.ref!.field, period: p as number } })}
          />
        </div>
      )}
    </div>
  );
}

/** Today / N days ago / within the last N days (requirement 11). */
function TimingEditor({ timing, onChange }: { timing: Timing; onChange: (t: Timing) => void }) {
  return (
    <div className="flex gap-1.5">
      <Select
        ariaLabel="Timing"
        className="!flex-1"
        value={timing.mode}
        options={[
          { value: "today", label: "Today" },
          { value: "daysAgo", label: "Days ago" },
          { value: "withinLast", label: "Within last" },
        ]}
        onChange={(mode) => {
          if (mode === "today") onChange({ mode: "today" });
          else onChange({ mode: mode as "daysAgo" | "withinLast", days: mode === "daysAgo" ? 1 : 3 });
        }}
      />
      {timing.mode !== "today" && (
        <NumberInput
          ariaLabel="Number of trading days"
          className="!w-[74px] !flex-none"
          min={1}
          max={MAX_LOOKBACK_DAYS}
          value={timing.days}
          onChange={(v) => onChange({ mode: timing.mode, days: Math.min(MAX_LOOKBACK_DAYS, Math.max(1, v ?? 1)) })}
        />
      )}
    </div>
  );
}
