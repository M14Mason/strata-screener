import { OPERATORS, fieldLabel, lookupField, metricIdFor, type OperatorId } from "./fields";
import { valueAt } from "./metrics";
import { HISTORY_DAYS, type SymbolSnapshot } from "./snapshot";

/**
 * Strategy rules: the tree the visual builder produces, plus the evaluator and
 * the plain-English explainer that answers "why does this stock match?".
 *
 * Rules are pure data. They are safe to persist, safe to send over the wire and
 * safe to evaluate -- there is no expression string and no eval() anywhere in
 * the path. Anything the evaluator does not recognise is rejected rather than
 * coerced, so a malformed or hostile rule fails closed.
 */

/** When to read the metric. */
export type Timing =
  | { mode: "today" }
  /** Exactly N trading days ago (1 = yesterday). */
  | { mode: "daysAgo"; days: number }
  /** True if the condition held on any of the last N trading days. */
  | { mode: "withinLast"; days: number };

export interface FieldRef {
  field: string;
  period?: number;
}

export interface Condition {
  kind: "condition";
  id: string;
  field: string;
  period?: number;
  op: OperatorId;
  /** Numeric right-hand side, when not comparing to another indicator. */
  value?: number;
  /** Upper bound for "between", or the tolerance for "is within % of". */
  value2?: number;
  /** Compare against another indicator instead of a number. */
  ref?: FieldRef;
  timing: Timing;
  /** Invert this single condition. */
  not?: boolean;
}

export type GroupLogic = "all" | "any" | "none";

export interface RuleGroup {
  kind: "group";
  id: string;
  logic: GroupLogic;
  children: RuleNode[];
}

export type RuleNode = RuleGroup | Condition;

export const GROUP_LOGIC_LABEL: Record<GroupLogic, string> = {
  all: "ALL of these",
  any: "ANY of these",
  none: "NONE of these",
};

export const MAX_LOOKBACK_DAYS = HISTORY_DAYS - 2;

export interface ConditionResult {
  conditionId: string;
  passed: boolean;
  /** One-line plain-English reason, e.g. "RSI(2) = 7.4, below 10". */
  explanation: string;
  /** The metric's actual value, for display next to the check mark. */
  actual: number | null;
  /** The threshold it was compared against, when there was one. */
  threshold: number | null;
  /** True when the data needed simply is not there for this symbol. */
  unavailable: boolean;
}

/**
 * A tree that mirrors the rule structure, so the explanation panel can render
 * "ALL of these" as a checklist and "ANY of these" as a list where some entries
 * legitimately did not match. A flat list of conditions could not express that
 * -- an unmet condition inside an ANY group is not a failure.
 */
export type TraceNode =
  | { kind: "group"; id: string; logic: GroupLogic; passed: boolean; children: TraceNode[] }
  | ({ kind: "condition" } & ConditionResult);

export interface EvaluationResult {
  passed: boolean;
  /** Flat list, in evaluation order - convenient for compact summaries. */
  conditions: ConditionResult[];
  /** Structured trace, used by the "why does this match?" panel. */
  trace: TraceNode | null;
}

// ---------------------------------------------------------------- formatting

function formatNumber(value: number, unit: string): string {
  if (!Number.isFinite(value)) return "n/a";
  switch (unit) {
    case "price":
      return `$${value.toFixed(value >= 1000 ? 0 : 2)}`;
    case "percent":
      return `${value >= 0 ? "" : ""}${value.toFixed(2)}%`;
    case "volume":
      return compact(value);
    case "currency":
      return `$${compact(value)}`;
    case "ratio":
      return `${value.toFixed(2)}x`;
    case "bool":
      return value ? "yes" : "no";
    default:
      return value.toFixed(value >= 100 ? 1 : 2);
  }
}

function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(0);
}

function timingPhrase(timing: Timing): string {
  switch (timing.mode) {
    case "today":
      return "";
    case "daysAgo":
      return timing.days === 1 ? " yesterday" : ` ${timing.days} trading days ago`;
    case "withinLast":
      return ` within the last ${timing.days} trading days`;
  }
}

// --------------------------------------------------------------- evaluation

/** Read either side of a comparison at a given day offset. */
function readOperand(
  snap: SymbolSnapshot,
  ref: FieldRef | undefined,
  literal: number | undefined,
  offset: number
): number | null {
  if (ref) {
    const metric = metricIdFor(ref.field, ref.period);
    return metric ? valueAt(snap, metric, offset) : null;
  }
  return literal ?? null;
}

/** Evaluate a single condition at one specific day offset. */
function testAtOffset(
  snap: SymbolSnapshot,
  cond: Condition,
  offset: number
): { passed: boolean; actual: number | null; threshold: number | null; unavailable: boolean } {
  const metric = metricIdFor(cond.field, cond.period);
  if (!metric) return { passed: false, actual: null, threshold: null, unavailable: true };

  const actual = valueAt(snap, metric, offset);
  const threshold = readOperand(snap, cond.ref, cond.value, offset);

  const op = Object.prototype.hasOwnProperty.call(OPERATORS, cond.op) ? OPERATORS[cond.op] : undefined;
  if (!op) return { passed: false, actual, threshold, unavailable: true };

  // Operators that need a previous bar reach one day further back.
  const needsPrev = cond.op === "crossesAbove" || cond.op === "crossesBelow" || cond.op === "rising" || cond.op === "falling";
  const prevActual = needsPrev ? valueAt(snap, metric, offset + 1) : null;
  const prevThreshold = needsPrev ? readOperand(snap, cond.ref, cond.value, offset + 1) : null;

  const missing =
    actual == null ||
    (op.operands >= 1 && threshold == null && cond.op !== "rising" && cond.op !== "falling") ||
    (needsPrev && prevActual == null);

  if (missing) return { passed: false, actual, threshold, unavailable: true };

  const a = actual as number;
  let passed = false;

  switch (cond.op) {
    case "gt":
      passed = a > (threshold as number);
      break;
    case "gte":
      passed = a >= (threshold as number);
      break;
    case "lt":
      passed = a < (threshold as number);
      break;
    case "lte":
      passed = a <= (threshold as number);
      break;
    case "between": {
      const lo = Math.min(threshold as number, cond.value2 ?? (threshold as number));
      const hi = Math.max(threshold as number, cond.value2 ?? (threshold as number));
      passed = a >= lo && a <= hi;
      break;
    }
    case "crossesAbove":
      passed = (prevActual as number) <= (prevThreshold as number) && a > (threshold as number);
      break;
    case "crossesBelow":
      passed = (prevActual as number) >= (prevThreshold as number) && a < (threshold as number);
      break;
    case "withinPct": {
      const tol = cond.value2 ?? 1;
      const ref = threshold as number;
      passed = ref !== 0 && Math.abs(((a - ref) / ref) * 100) <= tol;
      break;
    }
    case "rising":
      passed = prevActual != null && a > prevActual;
      break;
    case "falling":
      passed = prevActual != null && a < prevActual;
      break;
    case "isTrue":
      passed = a === 1;
      break;
    case "isFalse":
      passed = a !== 1;
      break;
  }

  return { passed, actual: a, threshold, unavailable: false };
}

function describe(cond: Condition, outcome: ReturnType<typeof testAtOffset>): string {
  const field = lookupField(cond.field);
  const unit = field?.unit ?? "number";
  const left = fieldLabel(cond.field, cond.period);
  const op = OPERATORS[cond.op];
  const when = timingPhrase(cond.timing);

  if (outcome.unavailable) return `${left}${when} is not available for this symbol`;

  const actualText = outcome.actual == null ? "n/a" : formatNumber(outcome.actual, unit);
  const rightLabel = cond.ref
    ? fieldLabel(cond.ref.field, cond.ref.period)
    : outcome.threshold == null
      ? ""
      : formatNumber(outcome.threshold, unit);
  const rightValue = cond.ref && outcome.threshold != null ? ` (${formatNumber(outcome.threshold, unit)})` : "";

  switch (cond.op) {
    case "between":
      return `${left}${when} = ${actualText}, ${op.phrase} ${formatNumber(cond.value ?? 0, unit)} and ${formatNumber(cond.value2 ?? 0, unit)}`;
    case "withinPct":
      return `${left}${when} = ${actualText}, within ${cond.value2 ?? 1}% of ${rightLabel}${rightValue}`;
    case "rising":
    case "falling":
      return `${left}${when} = ${actualText}, ${op.phrase}`;
    case "isTrue":
    case "isFalse":
      return `${left}${when} ${op.phrase}`;
    default:
      return `${left}${when} = ${actualText}, ${op.phrase} ${rightLabel}${rightValue}`;
  }
}

/** Evaluate one condition, honouring its timing mode. */
export function evaluateCondition(snap: SymbolSnapshot, cond: Condition): ConditionResult {
  const clampDays = (d: number) => Math.max(0, Math.min(MAX_LOOKBACK_DAYS, Math.floor(d)));

  let outcome: ReturnType<typeof testAtOffset>;

  if (cond.timing.mode === "withinLast") {
    // "held on any of the last N days" -- report the day that actually matched
    // so the explanation shows the value the user cares about.
    const days = clampDays(cond.timing.days);
    let best: ReturnType<typeof testAtOffset> | null = null;
    let anyAvailable = false;
    for (let offset = 0; offset <= days; offset++) {
      const r = testAtOffset(snap, cond, offset);
      if (!r.unavailable) anyAvailable = true;
      if (r.passed) {
        best = r;
        break;
      }
      if (!best || (best.unavailable && !r.unavailable)) best = r;
    }
    outcome = best ?? { passed: false, actual: null, threshold: null, unavailable: true };
    if (!anyAvailable) outcome = { ...outcome, unavailable: true, passed: false };
  } else {
    const offset = cond.timing.mode === "daysAgo" ? clampDays(cond.timing.days) : 0;
    outcome = testAtOffset(snap, cond, offset);
  }

  const raw = outcome.passed;
  const passed = cond.not ? !raw && !outcome.unavailable : raw;
  const base = describe(cond, outcome);

  return {
    conditionId: cond.id,
    passed,
    explanation: cond.not ? `NOT: ${base}` : base,
    actual: outcome.actual,
    threshold: outcome.threshold,
    unavailable: outcome.unavailable,
  };
}

/** Evaluate a whole rule tree, collecting a per-condition trace as it goes. */
export function evaluateRules(snap: SymbolSnapshot, root: RuleNode | null): EvaluationResult {
  const conditions: ConditionResult[] = [];
  if (!root) return { passed: true, conditions, trace: null };

  const walk = (node: RuleNode): TraceNode => {
    if (node.kind === "condition") {
      const result = evaluateCondition(snap, node);
      conditions.push(result);
      return { kind: "condition", ...result };
    }

    // Every child is evaluated even once the group's outcome is decided, so the
    // explanation can show which specific conditions missed rather than
    // stopping at the first one.
    const children = node.children.map(walk);

    // An empty group is neutral rather than a wall that blocks every symbol.
    let passed: boolean;
    if (!children.length) passed = true;
    else if (node.logic === "all") passed = children.every(childPassed);
    else if (node.logic === "any") passed = children.some(childPassed);
    else passed = !children.some(childPassed);

    return { kind: "group", id: node.id, logic: node.logic, passed, children };
  };

  const trace = walk(root);
  return { passed: childPassed(trace), conditions, trace };
}

const childPassed = (node: TraceNode): boolean => node.passed;

// -------------------------------------------------------------- validation

/** Reject anything that is not a well-formed rule tree. Fails closed. */
export function validateRuleNode(node: unknown, depth = 0): RuleNode | null {
  if (!node || typeof node !== "object" || depth > 6) return null;
  const n = node as Record<string, unknown>;

  if (n.kind === "group") {
    const logic = n.logic;
    if (logic !== "all" && logic !== "any" && logic !== "none") return null;
    const rawChildren = Array.isArray(n.children) ? n.children : [];
    const children = rawChildren
      .slice(0, 40)
      .map((c) => validateRuleNode(c, depth + 1))
      .filter((c): c is RuleNode => c !== null);
    return { kind: "group", id: String(n.id ?? `g${depth}`), logic, children };
  }

  if (n.kind === "condition") {
    const field = typeof n.field === "string" ? n.field : null;
    if (!field || !lookupField(field)) return null;
    const op = typeof n.op === "string" ? (n.op as OperatorId) : null;
    if (!op || !Object.prototype.hasOwnProperty.call(OPERATORS, op)) return null;

    const num = (v: unknown): number | undefined =>
      typeof v === "number" && Number.isFinite(v) ? v : undefined;
    const period = num(n.period);

    let ref: FieldRef | undefined;
    if (n.ref && typeof n.ref === "object") {
      const r = n.ref as Record<string, unknown>;
      if (typeof r.field === "string" && lookupField(r.field)) {
        ref = { field: r.field, period: num(r.period) };
      }
    }

    const t = (n.timing ?? { mode: "today" }) as Record<string, unknown>;
    let timing: Timing = { mode: "today" };
    if (t.mode === "daysAgo" || t.mode === "withinLast") {
      const days = Math.max(0, Math.min(MAX_LOOKBACK_DAYS, Math.floor(num(t.days) ?? 1)));
      timing = { mode: t.mode, days };
    }

    return {
      kind: "condition",
      id: String(n.id ?? Math.random().toString(36).slice(2)),
      field,
      period: period != null ? Math.max(1, Math.min(400, Math.floor(period))) : undefined,
      op,
      value: num(n.value),
      value2: num(n.value2),
      ref,
      timing,
      not: n.not === true,
    };
  }

  return null;
}

/** Flatten a tree into a readable summary, e.g. for strategy cards. */
export function summarizeRules(node: RuleNode | null): string[] {
  if (!node) return [];
  if (node.kind === "condition") {
    const left = fieldLabel(node.field, node.period);
    const op = OPERATORS[node.op];
    const field = lookupField(node.field);
    const right = node.ref
      ? fieldLabel(node.ref.field, node.ref.period)
      : node.value != null
        ? formatNumber(node.value, field?.unit ?? "number")
        : "";
    const when = timingPhrase(node.timing);
    const prefix = node.not ? "NOT " : "";

    // "is within % of" needs the tolerance spliced into the middle of the
    // phrase, not appended after it, or it reads "within % of SMA 200 (4%)".
    if (node.op === "withinPct") {
      return [`${prefix}${left} is within ${node.value2 ?? 1}% of ${right}${when}`.trim()];
    }
    if (node.op === "between") {
      const upper = formatNumber(node.value2 ?? 0, field?.unit ?? "number");
      return [`${prefix}${left} ${op.label} ${right} and ${upper}${when}`.trim()];
    }
    return [`${prefix}${left} ${op.label} ${right}${when}`.trim()];
  }
  return node.children.flatMap(summarizeRules);
}

export function countConditions(node: RuleNode | null): number {
  if (!node) return 0;
  if (node.kind === "condition") return 1;
  return node.children.reduce((sum, c) => sum + countConditions(c), 0);
}

export { formatNumber as formatMetricValue, compact as compactNumber };
