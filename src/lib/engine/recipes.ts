import { lookupField, type OperatorId } from "./fields";

/**
 * Condition recipes.
 *
 * A field on its own ("RSI") is not what someone searching the builder has in
 * mind -- they are looking for "RSI crosses above", "RSI between", "volume
 * spike". A recipe is a field plus a preconfigured operator, period and
 * starting value, so one search hit drops in a condition that is already
 * meaningful and only needs the number tweaked.
 *
 * Client-safe.
 */

export interface ConditionRecipe {
  id: string;
  label: string;
  /** What the condition will read as once added. */
  preview: string;
  field: string;
  period?: number;
  op: OperatorId;
  value?: number;
  value2?: number;
  ref?: { field: string; period?: number };
  keywords: string[];
  group: string;
}

export const RECIPES: ConditionRecipe[] = [
  // --- RSI -----------------------------------------------------------------
  { id: "rsi2-below", label: "RSI(2) is oversold", preview: "RSI(2) is below 10", field: "rsi", period: 2, op: "lt", value: 10, group: "Momentum & RSI", keywords: ["rsi", "rsi2", "oversold", "mean reversion"] },
  { id: "rsi14-strong", label: "RSI(14) is strong", preview: "RSI(14) is above 55", field: "rsi", period: 14, op: "gt", value: 55, group: "Momentum & RSI", keywords: ["rsi", "rsi14", "momentum", "strong"] },
  { id: "rsi-cross-above", label: "RSI crossover (up)", preview: "RSI(2) crosses above 10", field: "rsi", period: 2, op: "crossesAbove", value: 10, group: "Momentum & RSI", keywords: ["rsi", "rsi crossover", "crosses", "cross above"] },
  { id: "rsi-cross-below", label: "RSI crossover (down)", preview: "RSI(2) crosses below 90", field: "rsi", period: 2, op: "crossesBelow", value: 90, group: "Momentum & RSI", keywords: ["rsi", "rsi crossover", "crosses", "cross below"] },
  { id: "rsi-range", label: "RSI range", preview: "RSI(14) is between 40 and 60", field: "rsi", period: 14, op: "between", value: 40, value2: 60, group: "Momentum & RSI", keywords: ["rsi", "rsi range", "between"] },
  { id: "rsi-overbought", label: "RSI(14) is overbought", preview: "RSI(14) is above 70", field: "rsi", period: 14, op: "gt", value: 70, group: "Momentum & RSI", keywords: ["rsi", "overbought"] },

  // --- moving averages -----------------------------------------------------
  { id: "price-above-200", label: "Price above SMA 200", preview: "Price is above SMA 200", field: "price", op: "gt", ref: { field: "sma", period: 200 }, group: "Moving Averages", keywords: ["sma", "moving average", "uptrend", "above ma", "price above ma"] },
  { id: "price-below-200", label: "Price below SMA 200", preview: "Price is below SMA 200", field: "price", op: "lt", ref: { field: "sma", period: 200 }, group: "Moving Averages", keywords: ["sma", "moving average", "downtrend", "below ma"] },
  { id: "price-cross-50", label: "Price crosses above SMA 50", preview: "Price crosses above SMA 50", field: "price", op: "crossesAbove", ref: { field: "sma", period: 50 }, group: "Moving Averages", keywords: ["sma", "crossover", "cross above ma", "moving average"] },
  { id: "price-cross-below-50", label: "Price crosses below SMA 50", preview: "Price crosses below SMA 50", field: "price", op: "crossesBelow", ref: { field: "sma", period: 50 }, group: "Moving Averages", keywords: ["sma", "crossover", "cross below ma"] },
  { id: "price-near-50", label: "Price near SMA 50", preview: "Price is within 1% of SMA 50", field: "price", op: "withinPct", ref: { field: "sma", period: 50 }, value2: 1, group: "Moving Averages", keywords: ["distance from ma", "near ma", "pullback", "sma"] },
  { id: "golden", label: "SMA 50 above SMA 200", preview: "SMA 50 is above SMA 200", field: "sma", period: 50, op: "gt", ref: { field: "sma", period: 200 }, group: "Moving Averages", keywords: ["golden cross", "ma above ma", "sma", "trend"] },
  { id: "golden-cross", label: "Golden cross (just happened)", preview: "SMA 50 crosses above SMA 200", field: "sma", period: 50, op: "crossesAbove", ref: { field: "sma", period: 200 }, group: "Moving Averages", keywords: ["golden cross", "crossover", "sma"] },
  { id: "death-cross", label: "Death cross", preview: "SMA 50 crosses below SMA 200", field: "sma", period: 50, op: "crossesBelow", ref: { field: "sma", period: 200 }, group: "Moving Averages", keywords: ["death cross", "crossover", "sma"] },
  { id: "sma50-rising", label: "SMA 50 is rising", preview: "SMA 50 is rising", field: "sma", period: 50, op: "rising", group: "Moving Averages", keywords: ["ma rising", "sma", "slope", "trend"] },
  { id: "sma50-falling", label: "SMA 50 is falling", preview: "SMA 50 is falling", field: "sma", period: 50, op: "falling", group: "Moving Averages", keywords: ["ma falling", "sma", "slope"] },
  { id: "price-above-ema20", label: "Price above EMA 20", preview: "Price is above EMA 20", field: "price", op: "gt", ref: { field: "ema", period: 20 }, group: "Moving Averages", keywords: ["ema", "exponential", "moving average"] },

  // --- volume --------------------------------------------------------------
  { id: "avg-vol", label: "Average volume", preview: "Average volume (20d) is above 500,000", field: "avgVolume", op: "gt", value: 500_000, group: "Price & Volume", keywords: ["volume", "average volume", "liquidity"] },
  { id: "rel-vol", label: "Relative volume", preview: "Relative volume is above 1.5x", field: "relVolume", op: "gt", value: 1.5, group: "Price & Volume", keywords: ["volume", "relative volume", "rvol"] },
  { id: "vol-spike", label: "Volume spike", preview: "Relative volume is above 2.5x", field: "relVolume", op: "gt", value: 2.5, group: "Price & Volume", keywords: ["volume", "volume spike", "unusual volume"] },
  { id: "vol-above-avg", label: "Volume above its average", preview: "Volume is above Average volume (20d)", field: "volume", op: "gt", ref: { field: "avgVolume" }, group: "Price & Volume", keywords: ["volume", "volume above average"] },
  { id: "vol-below-avg", label: "Volume below its average", preview: "Volume is below Average volume (20d)", field: "volume", op: "lt", ref: { field: "avgVolume" }, group: "Price & Volume", keywords: ["volume", "volume below average", "quiet"] },
  { id: "dollar-vol", label: "Dollar volume", preview: "Average dollar volume (20d) is above $10M", field: "dollarVolume", op: "gt", value: 10_000_000, group: "Price & Volume", keywords: ["volume", "dollar volume", "turnover"] },
  { id: "above-vwap", label: "Price above VWAP", preview: "Price is above VWAP (20d rolling)", field: "price", op: "gt", ref: { field: "vwap20" }, group: "Price & Volume", keywords: ["vwap", "volume weighted"] },
  { id: "below-vwap", label: "Price below VWAP", preview: "Price is below VWAP (20d rolling)", field: "price", op: "lt", ref: { field: "vwap20" }, group: "Price & Volume", keywords: ["vwap", "volume weighted"] },

  // --- MACD / stochastic ---------------------------------------------------
  { id: "macd-bull", label: "MACD bullish crossover", preview: "MACD line crosses above MACD signal line", field: "macd", op: "crossesAbove", ref: { field: "macdSignal" }, group: "Momentum & RSI", keywords: ["macd", "bullish crossover", "crossover"] },
  { id: "macd-bear", label: "MACD bearish crossover", preview: "MACD line crosses below MACD signal line", field: "macd", op: "crossesBelow", ref: { field: "macdSignal" }, group: "Momentum & RSI", keywords: ["macd", "bearish crossover", "crossover"] },
  { id: "macd-above", label: "MACD above signal", preview: "MACD line is above MACD signal line", field: "macd", op: "gt", ref: { field: "macdSignal" }, group: "Momentum & RSI", keywords: ["macd", "above signal"] },
  { id: "macd-below", label: "MACD below signal", preview: "MACD line is below MACD signal line", field: "macd", op: "lt", ref: { field: "macdSignal" }, group: "Momentum & RSI", keywords: ["macd", "below signal"] },
  { id: "stoch-oversold", label: "Stochastic oversold", preview: "Stochastic %K is below 20", field: "stochK", op: "lt", value: 20, group: "Oscillators", keywords: ["stochastic", "oversold", "%k"] },
  { id: "stoch-overbought", label: "Stochastic overbought", preview: "Stochastic %K is above 80", field: "stochK", op: "gt", value: 80, group: "Oscillators", keywords: ["stochastic", "overbought", "%k"] },
  { id: "stoch-cross", label: "Stochastic crossover", preview: "Stochastic %K crosses above Stochastic %D", field: "stochK", op: "crossesAbove", ref: { field: "stochD" }, group: "Oscillators", keywords: ["stochastic", "crossover", "%k", "%d"] },

  // --- bollinger / volatility ---------------------------------------------
  { id: "bb-upper", label: "Price above upper Bollinger band", preview: "Price is above Bollinger upper band", field: "price", op: "gt", ref: { field: "bbUpper" }, group: "Trend & Volatility", keywords: ["bollinger", "upper band", "breakout"] },
  { id: "bb-lower", label: "Price below lower Bollinger band", preview: "Price is below Bollinger lower band", field: "price", op: "lt", ref: { field: "bbLower" }, group: "Trend & Volatility", keywords: ["bollinger", "lower band", "oversold"] },
  { id: "bb-squeeze", label: "Bollinger squeeze", preview: "Bollinger band width % is below 8%", field: "bbWidth", op: "lt", value: 8, group: "Trend & Volatility", keywords: ["bollinger", "squeeze", "band squeeze", "narrow"] },
  { id: "bb-position", label: "Distance from Bollinger band", preview: "Bollinger %B is below 10", field: "bbPercentB", op: "lt", value: 10, group: "Trend & Volatility", keywords: ["bollinger", "percent b", "distance from band"] },
  { id: "adx-trending", label: "Strong trend (ADX)", preview: "ADX (14) is above 25", field: "adx", op: "gt", value: 25, group: "Trend & Volatility", keywords: ["adx", "trend strength"] },
  { id: "adx-quiet", label: "Weak trend (ADX)", preview: "ADX (14) is below 20", field: "adx", op: "lt", value: 20, group: "Trend & Volatility", keywords: ["adx", "range", "choppy"] },
  { id: "di-bull", label: "DI+ above DI-", preview: "DI+ is above DI-", field: "diPlus", op: "gt", ref: { field: "diMinus" }, group: "Trend & Volatility", keywords: ["adx", "di+", "di-", "directional"] },
  { id: "atr-high", label: "High volatility (ATR %)", preview: "ATR % of price is above 4%", field: "atrPct", op: "gt", value: 4, group: "Trend & Volatility", keywords: ["atr", "volatility", "high volatility"] },
  { id: "atr-low", label: "Low volatility (ATR %)", preview: "ATR % of price is below 2%", field: "atrPct", op: "lt", value: 2, group: "Trend & Volatility", keywords: ["atr", "volatility", "low volatility"] },

  // --- price action --------------------------------------------------------
  { id: "new-high", label: "New 52-week high", preview: "New 52-week high is true", field: "newHigh52", op: "isTrue", group: "Price Action", keywords: ["52 week high", "new high", "breakout"] },
  { id: "new-low", label: "New 52-week low", preview: "New 52-week low is true", field: "newLow52", op: "isTrue", group: "Price Action", keywords: ["52 week low", "new low"] },
  { id: "near-high", label: "Within X% of 52-week high", preview: "Distance from 52-week high % is above -5%", field: "pctFrom52High", op: "gt", value: -5, group: "Price Action", keywords: ["52 week high", "near high", "breakout candidate"] },
  { id: "near-low", label: "Within X% of 52-week low", preview: "Distance from 52-week low % is below 5%", field: "pctFrom52Low", op: "lt", value: 5, group: "Price Action", keywords: ["52 week low", "near low"] },
  { id: "gap-up", label: "Gap up", preview: "Gap % is above 2%", field: "gapPct", op: "gt", value: 2, group: "Price Action", keywords: ["gap", "gap up", "opening gap"] },
  { id: "gap-down", label: "Gap down", preview: "Gap % is below -2%", field: "gapPct", op: "lt", value: -2, group: "Price Action", keywords: ["gap", "gap down"] },
  { id: "daily-gain", label: "Big daily gain", preview: "Daily change % is above 5%", field: "changePct", op: "gt", value: 5, group: "Price Action", keywords: ["daily gain", "gainer", "percent change"] },
  { id: "daily-loss", label: "Big daily loss", preview: "Daily change % is below -5%", field: "changePct", op: "lt", value: -5, group: "Price Action", keywords: ["daily loss", "loser", "percent change"] },
  { id: "up-streak", label: "Consecutive up days", preview: "Consecutive up days is at or above 3", field: "upDays", op: "gte", value: 3, group: "Price Action", keywords: ["consecutive up days", "streak"] },
  { id: "down-streak", label: "Consecutive down days", preview: "Consecutive down days is at or above 3", field: "downDays", op: "gte", value: 3, group: "Price Action", keywords: ["consecutive down days", "streak", "pullback"] },
  { id: "higher-high", label: "Higher high", preview: "Higher high is true", field: "higherHigh", op: "isTrue", group: "Price Action", keywords: ["higher high", "swing"] },
  { id: "higher-low", label: "Higher low", preview: "Higher low is true", field: "higherLow", op: "isTrue", group: "Price Action", keywords: ["higher low", "swing"] },
  { id: "lower-high", label: "Lower high", preview: "Lower high is true", field: "lowerHigh", op: "isTrue", group: "Price Action", keywords: ["lower high", "swing"] },
  { id: "lower-low", label: "Lower low", preview: "Lower low is true", field: "lowerLow", op: "isTrue", group: "Price Action", keywords: ["lower low", "swing"] },

  // --- momentum ------------------------------------------------------------
  { id: "mom-1d", label: "1-day momentum", preview: "1-day momentum is above 0%", field: "momentum", period: 1, op: "gt", value: 0, group: "Momentum & RSI", keywords: ["momentum", "1 day"] },
  { id: "mom-5d", label: "5-day momentum", preview: "5-day momentum is above 0%", field: "momentum", period: 5, op: "gt", value: 0, group: "Momentum & RSI", keywords: ["momentum", "5 day", "week"] },
  { id: "mom-20d", label: "20-day momentum", preview: "20-day momentum is above 5%", field: "momentum", period: 20, op: "gt", value: 5, group: "Momentum & RSI", keywords: ["momentum", "20 day", "month"] },
  { id: "mom-63d", label: "3-month momentum", preview: "63-day momentum is above 10%", field: "momentum", period: 63, op: "gt", value: 10, group: "Momentum & RSI", keywords: ["momentum", "3 month", "quarter"] },
  { id: "mom-126d", label: "6-month momentum", preview: "126-day momentum is above 15%", field: "momentum", period: 126, op: "gt", value: 15, group: "Momentum & RSI", keywords: ["momentum", "6 month", "half year"] },
  { id: "mom-252d", label: "1-year momentum", preview: "252-day momentum is above 20%", field: "momentum", period: 252, op: "gt", value: 20, group: "Momentum & RSI", keywords: ["momentum", "1 year", "annual"] },

  // --- price ---------------------------------------------------------------
  { id: "price-min", label: "Minimum price", preview: "Price is above $10", field: "price", op: "gt", value: 10, group: "Price & Volume", keywords: ["price", "minimum price"] },
  { id: "price-max", label: "Maximum price", preview: "Price is below $100", field: "price", op: "lt", value: 100, group: "Price & Volume", keywords: ["price", "maximum price"] },
];

/** Ranked search over recipes, used alongside the raw field search. */
export function searchRecipes(query: string): ConditionRecipe[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: Array<{ recipe: ConditionRecipe; score: number }> = [];
  for (const recipe of RECIPES) {
    if (!lookupField(recipe.field)) continue;
    const haystack = [recipe.label.toLowerCase(), ...recipe.keywords.map((k) => k.toLowerCase())];
    let score = 0;
    for (const word of haystack) {
      if (word === q) score = Math.max(score, 100);
      else if (word.startsWith(q)) score = Math.max(score, 70);
      else if (word.includes(q)) score = Math.max(score, 40);
    }
    if (score) scored.push({ recipe, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.recipe);
}
