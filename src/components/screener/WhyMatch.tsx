"use client";

import type { TraceNode } from "@/lib/engine/rules";
import { GROUP_LOGIC_LABEL } from "@/lib/engine/rules";
import { IconCheck, IconClose } from "../ui/Icons";

/**
 * "Why does this stock match?" (requirement 15).
 *
 * The wording here is load-bearing. Every line states a fact about the data and
 * the condition it satisfied -- never a judgement, a recommendation or a
 * forecast. The header says "matches your screening criteria", not "buy".
 *
 * Group logic is rendered honestly: inside an ANY group an unmet condition is
 * shown as unmet without the whole match being called into question, because
 * that is what OR means.
 */
export function WhyMatch({ trace, compact = false }: { trace: TraceNode | null; compact?: boolean }) {
  if (!trace) {
    return (
      <p className="text-[12.5px] muted">
        No strategy conditions were applied — this symbol is in the results because it passed the basic filters.
      </p>
    );
  }

  return (
    <div className={compact ? "text-[12px]" : "text-[12.5px]"}>
      <TraceView node={trace} depth={0} />
    </div>
  );
}

function TraceView({ node, depth }: { node: TraceNode; depth: number }) {
  if (node.kind === "condition") {
    const state = node.unavailable ? "unknown" : node.passed ? "pass" : "fail";
    return (
      <div className="flex items-start gap-2 py-[3px]">
        <Mark state={state} />
        <span
          className="leading-snug"
          style={{
            color: state === "pass" ? "var(--text)" : state === "unknown" ? "var(--text-faint)" : "var(--text-muted)",
          }}
        >
          {node.explanation}
        </span>
      </div>
    );
  }

  if (!node.children.length) return null;

  // The top-level ALL group is the default and does not need its own header;
  // any nested or non-ALL group does, because the logic changes the meaning.
  const showHeader = depth > 0 || node.logic !== "all";

  return (
    <div className={showHeader ? "mt-1.5" : ""} style={depth > 0 ? { paddingLeft: 10, borderLeft: "1px dashed var(--border-strong)" } : undefined}>
      {showHeader && (
        <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
          {GROUP_LOGIC_LABEL[node.logic]}
        </p>
      )}
      {node.children.map((child, i) => (
        <TraceView key={child.kind === "condition" ? child.conditionId : `${child.id}-${i}`} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

function Mark({ state }: { state: "pass" | "fail" | "unknown" }) {
  const style =
    state === "pass"
      ? { background: "var(--up-soft)", color: "var(--up)" }
      : state === "fail"
        ? { background: "var(--surface-hover)", color: "var(--text-faint)" }
        : { background: "transparent", color: "var(--text-faint)", border: "1px dashed var(--border-strong)" };

  return (
    <span className="mt-[2px] grid h-[15px] w-[15px] shrink-0 place-items-center rounded-full" style={style} aria-hidden>
      {state === "pass" ? <IconCheck size={10} /> : state === "fail" ? <IconClose size={9} /> : null}
    </span>
  );
}

/** The one-line summary shown on a result card. */
export function MatchSummary({ trace }: { trace: TraceNode | null }) {
  if (!trace) return <span className="text-[11.5px] faint">Passed the basic filters</span>;

  const counts = { pass: 0, total: 0 };
  const walk = (node: TraceNode) => {
    if (node.kind === "condition") {
      counts.total++;
      if (node.passed) counts.pass++;
      return;
    }
    node.children.forEach(walk);
  };
  walk(trace);

  const all = counts.pass === counts.total;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color: "var(--up)" }}>
      <IconCheck size={12} />
      {all
        ? `Matches all ${counts.total} ${counts.total === 1 ? "condition" : "conditions"}`
        : `Matches your criteria (${counts.pass} of ${counts.total} conditions met)`}
    </span>
  );
}
