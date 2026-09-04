"use client";

/** Tiny inline trend line. Pure SVG so it scales and themes for free. */
export function Sparkline({
  values,
  width = 96,
  height = 26,
  color,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (values.length < 2) return <span className="inline-block" style={{ width, height }} />;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / span) * (height - 3) - 1.5).toFixed(1)}`);
  const stroke = color ?? (values[values.length - 1] >= values[0] ? "var(--up)" : "var(--down)");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="overflow-visible">
      <polyline points={points.join(" ")} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
