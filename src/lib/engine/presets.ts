import type { BasicFilters } from "./filters";
import type { Condition, RuleGroup, Timing } from "./rules";

/**
 * The prebuilt strategy library and the quick-screen chips.
 *
 * Every entry is a *screen*: a description of conditions that are true right
 * now. None of them is a signal, a recommendation or a forecast, and the
 * copy here is written to keep that distinction obvious in the UI.
 */

let seq = 0;
const nextId = () => `p${++seq}`;

const TODAY: Timing = { mode: "today" };

/** Small builders so the library below reads like the conditions it describes. */
function cond(partial: Omit<Condition, "kind" | "id" | "timing"> & { timing?: Timing }): Condition {
  return { kind: "condition", id: nextId(), timing: TODAY, ...partial };
}

function group(logic: RuleGroup["logic"], children: RuleGroup["children"]): RuleGroup {
  return { kind: "group", id: nextId(), logic, children };
}

export type StrategyCategory = "Trend" | "Mean Reversion" | "Momentum" | "Pullbacks" | "Volatility";

export interface PresetStrategy {
  id: string;
  name: string;
  category: StrategyCategory;
  /** What the screen looks for, in plain language. */
  description: string;
  /** Short line rendered on the card. */
  tagline: string;
  rules: RuleGroup;
  filters?: BasicFilters;
}

export const PRESET_STRATEGIES: PresetStrategy[] = [
  {
    id: "rsi2-oversold",
    name: "RSI(2) Oversold",
    category: "Mean Reversion",
    tagline: "Uptrend, very low short-term RSI",
    description:
      "Finds stocks in longer-term uptrends that currently have a very low short-term RSI. RSI(2) reacts to just two sessions, so readings under 10 mark an unusually sharp near-term drop inside a rising trend.",
    rules: group("all", [
      cond({ field: "price", op: "gt", ref: { field: "sma", period: 200 } }),
      cond({ field: "rsi", period: 2, op: "lt", value: 10 }),
      cond({ field: "avgVolume", op: "gt", value: 500_000 }),
    ]),
  },
  {
    id: "rsi2-moderate",
    name: "RSI(2) Moderate Oversold",
    category: "Mean Reversion",
    tagline: "Uptrend, RSI(2) under 20",
    description:
      "The same idea as the RSI(2) Oversold screen with a looser threshold, which returns a broader list of candidates in longer-term uptrends.",
    rules: group("all", [
      cond({ field: "price", op: "gt", ref: { field: "sma", period: 200 } }),
      cond({ field: "rsi", period: 2, op: "lt", value: 20 }),
      cond({ field: "avgVolume", op: "gt", value: 500_000 }),
    ]),
  },
  {
    id: "sma50-pullback",
    name: "50 SMA Pullback",
    category: "Pullbacks",
    tagline: "Touched the 50-day, now back above it",
    description:
      "Finds stocks in longer-term uptrends that have recently pulled back toward their 50-day moving average and are currently back above it.",
    rules: group("all", [
      cond({ field: "price", op: "gt", ref: { field: "sma", period: 200 } }),
      cond({ field: "sma", period: 50, op: "gt", ref: { field: "sma", period: 200 } }),
      cond({
        field: "distSma50",
        op: "lt",
        value: 1,
        timing: { mode: "withinLast", days: 5 },
      }),
      cond({ field: "price", op: "gt", ref: { field: "sma", period: 50 } }),
      cond({ field: "avgVolume", op: "gt", value: 500_000 }),
    ]),
  },
  {
    id: "sma200-pullback",
    name: "200 SMA Pullback",
    category: "Pullbacks",
    tagline: "Holding just above the 200-day",
    description:
      "Finds stocks trading close to, but still above, their 200-day moving average after a recent test of that level.",
    rules: group("all", [
      cond({ field: "price", op: "gt", ref: { field: "sma", period: 200 } }),
      cond({ field: "price", op: "withinPct", ref: { field: "sma", period: 200 }, value2: 4 }),
      cond({
        field: "distSma200",
        op: "lt",
        value: 1.5,
        timing: { mode: "withinLast", days: 10 },
      }),
      cond({ field: "avgVolume", op: "gt", value: 400_000 }),
    ]),
  },
  {
    id: "golden-cross",
    name: "Golden Cross",
    category: "Trend",
    tagline: "SMA 50 crossed above SMA 200",
    description:
      "Finds stocks where the 50-day moving average has crossed above the 200-day moving average within the last ten sessions - a widely watched long-term trend condition.",
    rules: group("all", [
      cond({
        field: "sma",
        period: 50,
        op: "crossesAbove",
        ref: { field: "sma", period: 200 },
        timing: { mode: "withinLast", days: 10 },
      }),
      cond({ field: "avgVolume", op: "gt", value: 300_000 }),
    ]),
  },
  {
    id: "above-200",
    name: "Above the 200-day",
    category: "Trend",
    tagline: "Long-term uptrend filter",
    description:
      "The simplest long-term trend condition: price above the 200-day moving average, with the 50-day above the 200-day as confirmation.",
    rules: group("all", [
      cond({ field: "price", op: "gt", ref: { field: "sma", period: 200 } }),
      cond({ field: "sma", period: 50, op: "gt", ref: { field: "sma", period: 200 } }),
    ]),
  },
  {
    id: "momentum",
    name: "Momentum",
    category: "Momentum",
    tagline: "Uptrend with strong RSI(14) and 20-day gain",
    description:
      "Finds stocks in longer-term uptrends whose 14-day RSI is comfortably above the midpoint and whose 20-day price change is positive.",
    rules: group("all", [
      cond({ field: "price", op: "gt", ref: { field: "sma", period: 200 } }),
      cond({ field: "rsi", period: 14, op: "gt", value: 55 }),
      cond({ field: "momentum", period: 20, op: "gt", value: 0 }),
      cond({ field: "avgVolume", op: "gt", value: 500_000 }),
    ]),
  },
  {
    id: "momentum-50",
    name: "Strong 50-day Momentum",
    category: "Momentum",
    tagline: "Up 15%+ over 50 sessions",
    description:
      "Finds stocks whose price is up meaningfully over the last 50 trading days while still holding above their 50-day moving average.",
    rules: group("all", [
      cond({ field: "momentum", period: 50, op: "gt", value: 15 }),
      cond({ field: "price", op: "gt", ref: { field: "sma", period: 50 } }),
      cond({ field: "avgVolume", op: "gt", value: 500_000 }),
    ]),
  },
  {
    id: "breakout-candidate",
    name: "Breakout Candidate",
    category: "Momentum",
    tagline: "Near 52-week high on heavy volume",
    description:
      "Finds stocks trading within a few percent of their 52-week high with above-average volume and positive short-term momentum.",
    rules: group("all", [
      cond({ field: "pctFrom52High", op: "gt", value: -3 }),
      cond({ field: "relVolume", op: "gt", value: 1.5 }),
      cond({ field: "momentum", period: 20, op: "gt", value: 0 }),
      cond({ field: "avgVolume", op: "gt", value: 500_000 }),
    ]),
  },
  {
    id: "52w-breakout",
    name: "52-Week Breakout",
    category: "Momentum",
    tagline: "New 52-week high today",
    description:
      "Finds stocks that set a new 52-week high today - the session high reached or exceeded the highest high of the past year.",
    rules: group("all", [
      cond({ field: "newHigh52", op: "isTrue" }),
      cond({ field: "avgVolume", op: "gt", value: 300_000 }),
    ]),
  },
  {
    id: "bollinger-lower",
    name: "Bollinger Lower Band",
    category: "Mean Reversion",
    tagline: "Price at or below the lower band",
    description:
      "Finds stocks whose close has reached the lower Bollinger band while the longer-term trend is still up.",
    rules: group("all", [
      cond({ field: "bbPercentB", op: "lt", value: 5 }),
      cond({ field: "price", op: "gt", ref: { field: "sma", period: 200 } }),
      cond({ field: "avgVolume", op: "gt", value: 400_000 }),
    ]),
  },
  {
    id: "squeeze",
    name: "Bollinger Squeeze",
    category: "Volatility",
    tagline: "Bands unusually narrow",
    description:
      "Finds stocks whose Bollinger bands have contracted to an unusually narrow width, a condition often described as a volatility squeeze.",
    rules: group("all", [
      cond({ field: "bbWidth", op: "lt", value: 8 }),
      cond({ field: "adx", op: "lt", value: 20 }),
      cond({ field: "avgVolume", op: "gt", value: 400_000 }),
    ]),
  },
  {
    id: "oversold-any",
    name: "Oversold - RSI or Stochastic",
    category: "Mean Reversion",
    tagline: "Demonstrates ANY-of logic",
    description:
      "An example of OR logic: an uptrend filter combined with a group where either a very low RSI(2) or a very low Stochastic %K is enough to match.",
    rules: group("all", [
      cond({ field: "price", op: "gt", ref: { field: "sma", period: 200 } }),
      group("any", [
        cond({ field: "rsi", period: 2, op: "lt", value: 10 }),
        cond({ field: "rsi", period: 2, op: "crossesAbove", value: 10 }),
        cond({ field: "stochK", op: "lt", value: 15 }),
      ]),
      cond({ field: "avgVolume", op: "gt", value: 500_000 }),
    ]),
  },
  {
    id: "three-down-days",
    name: "Three Down Days in an Uptrend",
    category: "Pullbacks",
    tagline: "Consecutive red days above the 200-day",
    description:
      "Finds stocks above their 200-day moving average that have closed lower three or more sessions in a row.",
    rules: group("all", [
      cond({ field: "price", op: "gt", ref: { field: "sma", period: 200 } }),
      cond({ field: "downDays", op: "gte", value: 3 }),
      cond({ field: "avgVolume", op: "gt", value: 400_000 }),
    ]),
  },
  {
    id: "macd-cross",
    name: "MACD Bullish Crossover",
    category: "Trend",
    tagline: "MACD crossed above its signal line",
    description:
      "Finds stocks where the MACD line has crossed above its signal line within the last five sessions.",
    rules: group("all", [
      cond({
        field: "macd",
        op: "crossesAbove",
        ref: { field: "macdSignal" },
        timing: { mode: "withinLast", days: 5 },
      }),
      cond({ field: "avgVolume", op: "gt", value: 400_000 }),
    ]),
  },
  {
    id: "trend-strength",
    name: "Strong Trend (ADX)",
    category: "Trend",
    tagline: "ADX above 25 with DI+ leading",
    description:
      "Finds stocks whose Average Directional Index shows a strong trend with the positive directional indicator above the negative one.",
    rules: group("all", [
      cond({ field: "adx", op: "gt", value: 25 }),
      cond({ field: "diPlus", op: "gt", ref: { field: "diMinus" } }),
      cond({ field: "price", op: "gt", ref: { field: "sma", period: 50 } }),
      cond({ field: "avgVolume", op: "gt", value: 400_000 }),
    ]),
  },
];

export const STRATEGY_CATEGORIES: StrategyCategory[] = [
  "Trend",
  "Mean Reversion",
  "Momentum",
  "Pullbacks",
  "Volatility",
];

/** Chips at the top of the screener that add one condition or filter in a tap. */
export interface QuickScreen {
  id: string;
  label: string;
  hint: string;
  /** Conditions appended to the current rule tree. */
  conditions?: Condition[];
  /** Basic filters merged into the current filter set. */
  filters?: BasicFilters;
}

export const QUICK_SCREENS: QuickScreen[] = [
  {
    id: "rsi2-under-10",
    label: "RSI(2) < 10",
    hint: "Very low two-day RSI",
    conditions: [cond({ field: "rsi", period: 2, op: "lt", value: 10 })],
  },
  {
    id: "above-sma200",
    label: "Above SMA 200",
    hint: "Long-term uptrend",
    conditions: [cond({ field: "price", op: "gt", ref: { field: "sma", period: 200 } })],
  },
  {
    id: "near-sma50",
    label: "Near SMA 50",
    hint: "Within 2% of the 50-day",
    conditions: [cond({ field: "price", op: "withinPct", ref: { field: "sma", period: 50 }, value2: 2 })],
  },
  {
    id: "near-52w-high",
    label: "Near 52-week high",
    hint: "Within 5% of the high",
    conditions: [cond({ field: "pctFrom52High", op: "gt", value: -5 })],
  },
  {
    id: "high-volume",
    label: "High volume",
    hint: "Relative volume over 2x",
    conditions: [cond({ field: "relVolume", op: "gt", value: 2 })],
  },
  {
    id: "high-momentum",
    label: "High momentum",
    hint: "20-day change over 10%",
    conditions: [cond({ field: "momentum", period: 20, op: "gt", value: 10 })],
  },
  {
    id: "golden-cross-quick",
    label: "SMA 50 > SMA 200",
    hint: "Golden-cross state",
    conditions: [cond({ field: "sma", period: 50, op: "gt", ref: { field: "sma", period: 200 } })],
  },
  { id: "large-caps", label: "Large caps", hint: "$10B and above", filters: { marketCapTiers: ["large", "mega"] } },
  { id: "small-caps", label: "Small caps", hint: "$300M – $2B", filters: { marketCapTiers: ["small"] } },
  { id: "technology", label: "Technology", hint: "Technology sector only", filters: { sectors: ["Technology"] } },
  { id: "healthcare", label: "Healthcare", hint: "Healthcare sector only", filters: { sectors: ["Healthcare"] } },
  { id: "liquid", label: "Liquid only", hint: "Avg volume over 1M", filters: { avgVolumeMin: 1_000_000 } },
];

/** Deep-clones a preset and re-keys its ids so an edited copy stays independent. */
export function clonePresetRules(rules: RuleGroup): RuleGroup {
  const rekey = (node: RuleGroup["children"][number]): RuleGroup["children"][number] => {
    const id = Math.random().toString(36).slice(2, 10);
    if (node.kind === "condition") return { ...node, id };
    return { ...node, id, children: node.children.map(rekey) };
  };
  return rekey(rules) as RuleGroup;
}
