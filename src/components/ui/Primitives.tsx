"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconClose } from "./Icons";

/** A labelled form row. Keeps label/control spacing identical everywhere. */
export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <p className="mt-1.5 text-[11px] leading-snug faint">{hint}</p>}
    </div>
  );
}

/** Numeric input that keeps an empty string as "no value" rather than 0. */
export function NumberInput({
  value,
  onChange,
  placeholder,
  min,
  max,
  step,
  className = "",
  ariaLabel,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  ariaLabel?: string;
}) {
  // Held as text so intermediate states ("-", "1.") don't get clobbered.
  const [text, setText] = useState(value == null ? "" : String(value));
  const lastPropValue = useRef(value);

  useEffect(() => {
    if (lastPropValue.current !== value) {
      lastPropValue.current = value;
      setText(value == null ? "" : String(value));
    }
  }, [value]);

  return (
    <input
      className={`input tnum ${className}`}
      inputMode="decimal"
      aria-label={ariaLabel}
      placeholder={placeholder ?? "Any"}
      value={text}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        if (next.trim() === "") {
          lastPropValue.current = undefined;
          onChange(undefined);
          return;
        }
        const parsed = Number(next);
        if (Number.isFinite(parsed)) {
          lastPropValue.current = parsed;
          onChange(parsed);
        }
      }}
    />
  );
}

export function Select<T extends string | number>({
  value,
  onChange,
  options,
  className = "",
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <select
      className={`input ${className}`}
      aria-label={ariaLabel}
      value={String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        const match = options.find((o) => String(o.value) === raw);
        if (match) onChange(match.value);
      }}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Chip({
  active,
  onClick,
  children,
  title,
  className = "",
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <button type="button" className={`chip ${className}`} data-active={active ? "true" : "false"} onClick={onClick} title={title}>
      {children}
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 py-2 text-left"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-[11px] leading-snug faint">{hint}</span>}
      </span>
      <span
        className="relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200"
        style={{ background: checked ? "var(--accent)" : "var(--border-strong)" }}
      >
        <motion.span
          className="absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow"
          animate={{ left: checked ? 23 : 3 }}
          transition={{ type: "spring", stiffness: 520, damping: 34 }}
        />
      </span>
    </button>
  );
}

/**
 * A dialog that renders as a centred modal on desktop and a bottom sheet on
 * touch-sized screens -- the pattern requirement 28 asks for, in one component
 * so every surface behaves the same way.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl border sm:rounded-2xl ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}
            style={{ background: "var(--bg-elevated)", boxShadow: "var(--shadow-pop)" }}
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.99 }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
          >
            <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
              <h2 className="text-[15px] font-semibold">{title}</h2>
              <button className="btn btn-ghost !px-2" onClick={onClose} aria-label="Close">
                <IconClose size={17} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="safe-bottom border-t px-5 py-3">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/** Inline confirm used before anything destructive. */
export function ConfirmButton({
  onConfirm,
  label,
  confirmLabel = "Confirm",
  className = "btn btn-danger",
  children,
}: {
  onConfirm: () => void;
  label: string;
  confirmLabel?: string;
  className?: string;
  children?: ReactNode;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3200);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      onClick={() => {
        if (armed) {
          onConfirm();
          setArmed(false);
        } else {
          setArmed(true);
        }
      }}
    >
      {armed ? confirmLabel : (children ?? label)}
    </button>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon && <div className="mb-1 faint">{icon}</div>}
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <p className="max-w-sm text-[13px] leading-relaxed muted">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Compact tooltip-on-hover for column headers and metric labels. */
export function Hint({ text, children }: { text: string; children: ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      <AnimatePresence>
        {show && (
          <motion.span
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 2 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1.5 w-max max-w-[240px] -translate-x-1/2 rounded-lg border px-2.5 py-1.5 text-[11px] font-normal leading-snug"
            style={{ background: "var(--bg-elevated)", boxShadow: "var(--shadow-pop)", color: "var(--text-muted)" }}
          >
            {text}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
