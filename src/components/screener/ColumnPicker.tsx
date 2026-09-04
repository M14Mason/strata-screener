"use client";

import { COLUMNS, columnById } from "./columns";
import { Sheet } from "../ui/Primitives";
import { IconCheck, IconChevron } from "../ui/Icons";

/** Show / hide / reorder result columns (requirement 13). */
export function ColumnPicker({
  open,
  onClose,
  columns,
  onChange,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  columns: string[];
  onChange: (next: string[]) => void;
  onReset: () => void;
}) {
  const visible = columns.map(columnById).filter(Boolean);
  const hidden = COLUMNS.filter((c) => !columns.includes(c.id));

  const move = (index: number, delta: number) => {
    const next = [...columns];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Columns"
      footer={
        <div className="flex justify-between gap-2">
          <button className="btn btn-ghost" onClick={onReset}>
            Reset to default
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      }
    >
      <section className="mb-5">
        <h3 className="label">Shown — drag order with the arrows</h3>
        <ul className="flex flex-col gap-1">
          {visible.map((col, i) => (
            <li
              key={col!.id}
              className="flex items-center gap-2 rounded-[10px] border px-2.5 py-2"
              style={{ background: "var(--surface)" }}
            >
              <span className="grid h-4 w-4 place-items-center rounded" style={{ color: "var(--accent)" }}>
                <IconCheck size={13} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px]">{col!.label}</span>
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  className="btn btn-ghost !px-1.5 !py-1"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${col!.label} up`}
                >
                  <span className="inline-flex -rotate-90">
                    <IconChevron size={13} />
                  </span>
                </button>
                <button
                  className="btn btn-ghost !px-1.5 !py-1"
                  onClick={() => move(i, 1)}
                  disabled={i === visible.length - 1}
                  aria-label={`Move ${col!.label} down`}
                >
                  <span className="inline-flex rotate-90">
                    <IconChevron size={13} />
                  </span>
                </button>
                <button
                  className="btn btn-ghost !px-2 !py-1 text-[12px]"
                  onClick={() => onChange(columns.filter((c) => c !== col!.id))}
                  disabled={col!.locked}
                  title={col!.locked ? "This column cannot be hidden" : undefined}
                >
                  Hide
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {hidden.length > 0 && (
        <section>
          <h3 className="label">Available</h3>
          <div className="flex flex-wrap gap-1.5">
            {hidden.map((col) => (
              <button key={col.id} className="chip" onClick={() => onChange([...columns, col.id])}>
                + {col.label}
              </button>
            ))}
          </div>
        </section>
      )}
    </Sheet>
  );
}
