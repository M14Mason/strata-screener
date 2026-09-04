/**
 * The filter catalog.
 *
 * One declarative list drives three things that would otherwise drift apart:
 * the dropdowns in the strategy builder, the search box that finds a filter by
 * name, and the server-side evaluator that turns a saved rule into a number.
 *
 * Adding an indicator to the whole app is: compute it in `buildSnapshot`, then
 * add an entry here.
 *
 * Safe to import from client components -- it contains no server code.
 */

export type Unit = "price" | "percent" | "ratio" | "number" | "volume" | "currency" | "bool";

export type OperatorId =
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "crossesAbove"
  | "crossesBelow"
  | "withinPct"
  | "rising"
  | "falling"
  | "isTrue"
  | "isFalse";

export interface OperatorDef {
  id: OperatorId;
  label: string;
  /** How many numeric inputs the operator needs beyond its left-hand field. */
  operands: 0 | 1 | 2;
  /** May the right-hand side be another indicator rather than a number? */
  allowsRef: boolean;
  /** Phrase used when explaining a match in plain English. */
  phrase: string;
}

export const OPERATORS: Record<OperatorId, OperatorDef> = {
  gt: { id: "gt", label: "is above", operands: 1, allowsRef: true, phrase: "is above" },
  gte: { id: "gte", label: "is at or above", operands: 1, allowsRef: true, phrase: "is at or above" },
  lt: { id: "lt", label: "is below", operands: 1, allowsRef: true, phrase: "is below" },
  lte: { id: "lte", label: "is at or below", operands: 1, allowsRef: true, phrase: "is at or below" },
  between: { id: "between", label: "is between", operands: 2, allowsRef: false, phrase: "is between" },
  crossesAbove: { id: "crossesAbove", label: "crosses above", operands: 1, allowsRef: true, phrase: "crossed above" },
  crossesBelow: { id: "crossesBelow", label: "crosses below", operands: 1, allowsRef: true, phrase: "crossed below" },
  withinPct: { id: "withinPct", label: "is within % of", operands: 2, allowsRef: true, phrase: "is within" },
  rising: { id: "rising", label: "is rising", operands: 0, allowsRef: false, phrase: "is rising" },
  falling: { id: "falling", label: "is falling", operands: 0, allowsRef: false, phrase: "is falling" },
  isTrue: { id: "isTrue", label: "is true", operands: 0, allowsRef: false, phrase: "is true" },
  isFalse: { id: "isFalse", label: "is not true", operands: 0, allowsRef: false, phrase: "is not true" },
};

export const NUMERIC_OPS: OperatorId[] = ["gt", "gte", "lt", "lte", "between", "crossesAbove", "crossesBelow"];
export const LEVEL_OPS: OperatorId[] = ["gt", "gte", "lt", "lte", "between", "crossesAbove", "crossesBelow", "rising", "falling"];
export const BOOL_OPS: OperatorId[] = ["isTrue", "isFalse"];

export type FieldGroup =
  | "Price & Volume"
  | "Moving Averages"
  | "Momentum & RSI"
  | "Trend & Volatility"
  | "Oscillators"
  | "Price Action"
  | "Fundamentals";

export interface FieldDef {
  id: string;
  label: string;
  group: FieldGroup;
  /** Snapshot metric id, or a builder for parameterised fields. */
  metric: string | ((period: number) => string);
  unit: Unit;
  /** Present when the field takes a period. */
  periods?: number[];
  defaultPeriod?: number;
  allowCustomPeriod?: boolean;
  /** Operators offered for this field. */
  operators: OperatorId[];
  /** May this field appear on the right-hand side of a comparison? */
  comparable?: boolean;
  /** Extra words the filter search should match on. */
  keywords?: string[];
  description?: string;
  /** Sensible starting value so a newly added condition is already meaningful. */
  defaultValue?: number;
}

export const FIELDS: FieldDef[] = [
  // ---------------------------------------------------------------- price
  {
    id: "price",
    label: "Price",
    group: "Price & Volume",
    metric: "close",
    unit: "price",
    operators: [...LEVEL_OPS, "withinPct"],
    comparable: true,
    keywords: ["close", "last", "share price"],
    description: "The most recent closing price.",
    defaultValue: 10,
  },
  { id: "open", label: "Open", group: "Price & Volume", metric: "open", unit: "price", operators: NUMERIC_OPS, comparable: true, keywords: ["opening"] },
  { id: "high", label: "High", group: "Price & Volume", metric: "high", unit: "price", operators: NUMERIC_OPS, comparable: true },
  { id: "low", label: "Low", group: "Price & Volume", metric: "low", unit: "price", operators: NUMERIC_OPS, comparable: true },
  {
    id: "changePct",
    label: "Daily change %",
    group: "Price & Volume",
    metric: "changePct",
    unit: "percent",
    operators: NUMERIC_OPS,
    keywords: ["gain", "loss", "percent change", "day change"],
    description: "Percent change from the previous close.",
    defaultValue: 3,
  },
  {
    id: "volume",
    label: "Volume",
    group: "Price & Volume",
    metric: "volume",
    unit: "volume",
    operators: NUMERIC_OPS,
    comparable: true,
    keywords: ["shares traded"],
    defaultValue: 1_000_000,
  },
  {
    id: "avgVolume",
    label: "Average volume (20d)",
    group: "Price & Volume",
    metric: "avgVol20",
    unit: "volume",
    operators: NUMERIC_OPS,
    comparable: true,
    keywords: ["average volume", "liquidity", "avg vol"],
    description: "20-day average of daily share volume.",
    defaultValue: 500_000,
  },
  {
    id: "avgVolume50",
    label: "Average volume (50d)",
    group: "Price & Volume",
    metric: "avgVol50",
    unit: "volume",
    operators: NUMERIC_OPS,
    comparable: true,
    keywords: ["average volume", "liquidity"],
    defaultValue: 500_000,
  },
  {
    id: "dollarVolume",
    label: "Average dollar volume (20d)",
    group: "Price & Volume",
    metric: "dollarVol20",
    unit: "currency",
    operators: NUMERIC_OPS,
    keywords: ["dollar volume", "turnover", "liquidity"],
    defaultValue: 10_000_000,
  },
  {
    id: "relVolume",
    label: "Relative volume",
    group: "Price & Volume",
    metric: "relVolume",
    unit: "ratio",
    operators: NUMERIC_OPS,
    keywords: ["rvol", "relative volume", "volume spike", "unusual volume"],
    description: "Today's volume divided by the prior 20-day average.",
    defaultValue: 1.5,
  },
  {
    id: "vwap20",
    label: "VWAP (20d rolling)",
    group: "Price & Volume",
    metric: "vwap20",
    unit: "price",
    operators: [...NUMERIC_OPS, "withinPct"],
    comparable: true,
    keywords: ["vwap", "volume weighted"],
    description: "Volume-weighted average price over the last 20 sessions.",
  },
  {
    id: "distVwap",
    label: "Distance from VWAP %",
    group: "Price & Volume",
    metric: "distVwap20",
    unit: "percent",
    operators: NUMERIC_OPS,
    keywords: ["vwap distance"],
  },

  // ------------------------------------------------------- moving averages
  {
    id: "sma",
    label: "SMA",
    group: "Moving Averages",
    metric: (p) => `sma${p}`,
    unit: "price",
    periods: [5, 10, 20, 50, 100, 150, 200],
    defaultPeriod: 200,
    allowCustomPeriod: true,
    operators: [...LEVEL_OPS, "withinPct"],
    comparable: true,
    keywords: ["simple moving average", "moving average", "ma"],
    description: "Simple moving average of the close.",
  },
  {
    id: "ema",
    label: "EMA",
    group: "Moving Averages",
    metric: (p) => `ema${p}`,
    unit: "price",
    periods: [5, 10, 20, 50, 100, 200],
    defaultPeriod: 20,
    allowCustomPeriod: true,
    operators: [...LEVEL_OPS, "withinPct"],
    comparable: true,
    keywords: ["exponential moving average", "moving average", "ma"],
    description: "Exponential moving average of the close.",
  },
  {
    id: "distSma20",
    label: "Distance from SMA 20 %",
    group: "Moving Averages",
    metric: "distSma20",
    unit: "percent",
    operators: NUMERIC_OPS,
    keywords: ["distance", "extended", "sma20"],
  },
  {
    id: "distSma50",
    label: "Distance from SMA 50 %",
    group: "Moving Averages",
    metric: "distSma50",
    unit: "percent",
    operators: NUMERIC_OPS,
    keywords: ["distance", "pullback", "sma50"],
    description: "Percent the close sits above (+) or below (-) its 50-day SMA.",
  },
  {
    id: "distSma200",
    label: "Distance from SMA 200 %",
    group: "Moving Averages",
    metric: "distSma200",
    unit: "percent",
    operators: NUMERIC_OPS,
    keywords: ["distance", "extended", "sma200"],
  },

  // ------------------------------------------------------------ momentum
  {
    id: "rsi",
    label: "RSI",
    group: "Momentum & RSI",
    metric: (p) => `rsi${p}`,
    unit: "number",
    periods: [2, 3, 5, 7, 9, 14, 21],
    defaultPeriod: 2,
    allowCustomPeriod: true,
    operators: LEVEL_OPS,
    comparable: true,
    keywords: ["rsi", "relative strength index", "oversold", "overbought", "rsi crossover", "rsi range"],
    description: "Wilder's Relative Strength Index. Short periods such as RSI(2) swing much harder than RSI(14).",
    defaultValue: 10,
  },
  {
    id: "momentum",
    label: "Momentum %",
    group: "Momentum & RSI",
    metric: (p) => `mom${p}`,
    unit: "percent",
    periods: [1, 5, 10, 20, 50, 63, 126, 252],
    defaultPeriod: 20,
    operators: NUMERIC_OPS,
    keywords: ["momentum", "roc", "rate of change", "performance", "return"],
    description: "Percent price change over the selected number of trading days (63 ≈ 3 months, 126 ≈ 6 months, 252 ≈ 1 year).",
    defaultValue: 0,
  },
  {
    id: "macd",
    label: "MACD line",
    group: "Momentum & RSI",
    metric: "macd",
    unit: "number",
    operators: LEVEL_OPS,
    comparable: true,
    keywords: ["macd", "convergence divergence"],
  },
  {
    id: "macdSignal",
    label: "MACD signal line",
    group: "Momentum & RSI",
    metric: "macdSignal",
    unit: "number",
    operators: LEVEL_OPS,
    comparable: true,
    keywords: ["macd", "signal"],
  },
  {
    id: "macdHist",
    label: "MACD histogram",
    group: "Momentum & RSI",
    metric: "macdHist",
    unit: "number",
    operators: LEVEL_OPS,
    keywords: ["macd", "histogram", "crossover"],
    defaultValue: 0,
  },

  // -------------------------------------------------- trend & volatility
  {
    id: "adx",
    label: "ADX (14)",
    group: "Trend & Volatility",
    metric: "adx14",
    unit: "number",
    operators: NUMERIC_OPS,
    keywords: ["adx", "trend strength", "directional"],
    description: "Average Directional Index. Above 25 is usually read as a trending market.",
    defaultValue: 25,
  },
  { id: "diPlus", label: "DI+", group: "Trend & Volatility", metric: "diPlus", unit: "number", operators: NUMERIC_OPS, comparable: true, keywords: ["di+", "directional indicator"] },
  { id: "diMinus", label: "DI-", group: "Trend & Volatility", metric: "diMinus", unit: "number", operators: NUMERIC_OPS, comparable: true, keywords: ["di-", "directional indicator"] },
  { id: "atr", label: "ATR (14)", group: "Trend & Volatility", metric: "atr14", unit: "price", operators: NUMERIC_OPS, keywords: ["atr", "average true range", "volatility"] },
  {
    id: "atrPct",
    label: "ATR % of price",
    group: "Trend & Volatility",
    metric: "atrPct",
    unit: "percent",
    operators: NUMERIC_OPS,
    keywords: ["atr", "volatility", "atr percent"],
    description: "ATR(14) as a percent of price - a size-neutral volatility read.",
    defaultValue: 3,
  },
  { id: "bbUpper", label: "Bollinger upper band", group: "Trend & Volatility", metric: "bbUpper", unit: "price", operators: NUMERIC_OPS, comparable: true, keywords: ["bollinger", "band"] },
  { id: "bbLower", label: "Bollinger lower band", group: "Trend & Volatility", metric: "bbLower", unit: "price", operators: NUMERIC_OPS, comparable: true, keywords: ["bollinger", "band"] },
  { id: "bbMiddle", label: "Bollinger middle band", group: "Trend & Volatility", metric: "bbMiddle", unit: "price", operators: NUMERIC_OPS, comparable: true, keywords: ["bollinger", "band"] },
  {
    id: "bbWidth",
    label: "Bollinger band width %",
    group: "Trend & Volatility",
    metric: "bbWidth",
    unit: "percent",
    operators: NUMERIC_OPS,
    keywords: ["bollinger", "squeeze", "band width", "volatility"],
    description: "Band spread as a percent of the middle band. Low values indicate a squeeze.",
    defaultValue: 8,
  },
  {
    id: "bbPercentB",
    label: "Bollinger %B",
    group: "Trend & Volatility",
    metric: "bbPercentB",
    unit: "percent",
    operators: NUMERIC_OPS,
    keywords: ["bollinger", "percent b", "band position"],
    description: "Where price sits inside the bands: 0 = lower band, 100 = upper band.",
    defaultValue: 0,
  },

  // ---------------------------------------------------------- oscillators
  {
    id: "stochK",
    label: "Stochastic %K",
    group: "Oscillators",
    metric: "stochK",
    unit: "number",
    operators: LEVEL_OPS,
    comparable: true,
    keywords: ["stochastic", "%k", "oversold", "overbought"],
    defaultValue: 20,
  },
  {
    id: "stochD",
    label: "Stochastic %D",
    group: "Oscillators",
    metric: "stochD",
    unit: "number",
    operators: LEVEL_OPS,
    comparable: true,
    keywords: ["stochastic", "%d"],
    defaultValue: 20,
  },

  // -------------------------------------------------------- price action
  {
    id: "pctFrom52High",
    label: "Distance from 52-week high %",
    group: "Price Action",
    metric: "pctFrom52High",
    unit: "percent",
    operators: NUMERIC_OPS,
    keywords: ["52 week high", "52w high", "near high", "breakout"],
    description: "0 means the close is at its 52-week high; -5 means 5% below it.",
    defaultValue: -3,
  },
  {
    id: "pctFrom52Low",
    label: "Distance from 52-week low %",
    group: "Price Action",
    metric: "pctFrom52Low",
    unit: "percent",
    operators: NUMERIC_OPS,
    keywords: ["52 week low", "52w low", "near low"],
    defaultValue: 5,
  },
  { id: "high52", label: "52-week high", group: "Price Action", metric: "high52", unit: "price", operators: NUMERIC_OPS, comparable: true, keywords: ["52 week high"] },
  { id: "low52", label: "52-week low", group: "Price Action", metric: "low52", unit: "price", operators: NUMERIC_OPS, comparable: true, keywords: ["52 week low"] },
  {
    id: "gapPct",
    label: "Gap %",
    group: "Price Action",
    metric: "gapPct",
    unit: "percent",
    operators: NUMERIC_OPS,
    keywords: ["gap up", "gap down", "opening gap"],
    description: "Today's open against yesterday's close.",
    defaultValue: 2,
  },
  {
    id: "upDays",
    label: "Consecutive up days",
    group: "Price Action",
    metric: "upDays",
    unit: "number",
    operators: NUMERIC_OPS,
    keywords: ["consecutive up", "streak", "up days"],
    defaultValue: 3,
  },
  {
    id: "downDays",
    label: "Consecutive down days",
    group: "Price Action",
    metric: "downDays",
    unit: "number",
    operators: NUMERIC_OPS,
    keywords: ["consecutive down", "streak", "down days", "pullback"],
    defaultValue: 3,
  },
  {
    id: "newHigh52",
    label: "New 52-week high",
    group: "Price Action",
    metric: "newHigh52",
    unit: "bool",
    operators: BOOL_OPS,
    keywords: ["new high", "52 week high", "breakout", "new 52-week high"],
    description: "Today's high reached or exceeded the highest high of the last 52 weeks.",
  },
  {
    id: "newLow52",
    label: "New 52-week low",
    group: "Price Action",
    metric: "newLow52",
    unit: "bool",
    operators: BOOL_OPS,
    keywords: ["new low", "52 week low", "breakdown", "new 52-week low"],
    description: "Today's low reached or undercut the lowest low of the last 52 weeks.",
  },
  { id: "higherHigh", label: "Higher high", group: "Price Action", metric: "higherHigh", unit: "bool", operators: BOOL_OPS, keywords: ["higher high", "swing"] },
  { id: "higherLow", label: "Higher low", group: "Price Action", metric: "higherLow", unit: "bool", operators: BOOL_OPS, keywords: ["higher low", "swing"] },
  { id: "lowerHigh", label: "Lower high", group: "Price Action", metric: "lowerHigh", unit: "bool", operators: BOOL_OPS, keywords: ["lower high", "swing"] },
  { id: "lowerLow", label: "Lower low", group: "Price Action", metric: "lowerLow", unit: "bool", operators: BOOL_OPS, keywords: ["lower low", "swing"] },
];

/**
 * Null-prototype map, and every lookup goes through `lookupField`.
 *
 * A plain object literal would resolve `FIELD_BY_ID["__proto__"]` (and
 * "constructor", "toString", ...) to something truthy, which would let a
 * crafted rule slip past validation. Rule input is user-controlled and is
 * persisted, so the lookup has to be safe by construction.
 */
const fieldIndex: Record<string, FieldDef> = Object.create(null);
for (const f of FIELDS) fieldIndex[f.id] = f;

export function lookupField(id: unknown): FieldDef | undefined {
  return typeof id === "string" ? fieldIndex[id] : undefined;
}

export const FIELD_BY_ID: Record<string, FieldDef> = fieldIndex;

export const FIELD_GROUPS: FieldGroup[] = [
  "Price & Volume",
  "Moving Averages",
  "Momentum & RSI",
  "Trend & Volatility",
  "Oscillators",
  "Price Action",
];

/** Fields that may be used as the right-hand side of a comparison. */
export const COMPARABLE_FIELDS = FIELDS.filter((f) => f.comparable);

/** Snapshot metric id for a field reference. */
export function metricIdFor(fieldId: string, period?: number): string | null {
  const field = lookupField(fieldId);
  if (!field) return null;
  if (typeof field.metric === "string") return field.metric;
  const p = period ?? field.defaultPeriod ?? field.periods?.[0];
  if (!p || !Number.isInteger(p) || p < 1 || p > 400) return null;
  return field.metric(p);
}

/** "SMA 200", "RSI(2)", "Average volume (20d)" - used in labels and explanations. */
export function fieldLabel(fieldId: string, period?: number): string {
  const field = lookupField(fieldId);
  if (!field) return fieldId;
  if (!field.periods) return field.label;
  const p = period ?? field.defaultPeriod ?? field.periods[0];
  return field.id === "rsi" ? `RSI(${p})` : field.id === "momentum" ? `${p}-day momentum` : `${field.label} ${p}`;
}

/** Ranked search over the catalog, powering the builder's filter search box. */
export function searchFields(query: string): FieldDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return FIELDS;
  const scored: Array<{ field: FieldDef; score: number }> = [];
  for (const field of FIELDS) {
    const label = field.label.toLowerCase();
    const words = [label, ...(field.keywords ?? []).map((k) => k.toLowerCase())];
    let score = 0;
    for (const w of words) {
      if (w === q) score = Math.max(score, 100);
      else if (w.startsWith(q)) score = Math.max(score, 70);
      else if (w.includes(q)) score = Math.max(score, 40);
    }
    if (!score && (field.description ?? "").toLowerCase().includes(q)) score = 15;
    if (score) scored.push({ field, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.field.label.localeCompare(b.field.label)).map((s) => s.field);
}
