/**
 * Inline icon set.
 *
 * Hand-rolled rather than pulled from a library: it keeps the bundle small,
 * keeps stroke weight consistent with the type, and avoids shipping hundreds of
 * glyphs to draw a dozen.
 */
type P = { className?: string; size?: number };

const base = (size = 18) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const IconDashboard = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><rect x="3" y="3" width="7.5" height="8.5" rx="2" /><rect x="13.5" y="3" width="7.5" height="5" rx="2" /><rect x="3" y="15" width="7.5" height="6" rx="2" /><rect x="13.5" y="11.5" width="7.5" height="9.5" rx="2" /></svg>
);
export const IconScreener = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M3 5h18M6 12h12M10 19h4" /></svg>
);
export const IconStrategy = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><rect x="3" y="3" width="6" height="6" rx="1.8" /><rect x="15" y="15" width="6" height="6" rx="1.8" /><rect x="3" y="15" width="6" height="6" rx="1.8" /><path d="M9 6h4a2 2 0 0 1 2 2v10M9 18h6" /></svg>
);
export const IconWatchlist = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M5 3.5h14a1 1 0 0 1 1 1v15.2a.8.8 0 0 1-1.24.67L12 16.2l-6.76 4.17A.8.8 0 0 1 4 19.7V4.5a1 1 0 0 1 1-1Z" /></svg>
);
export const IconStock = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M3 20h18" /><path d="M6 16V9M6 6v1.5M6 16v2" /><rect x="4.2" y="7.5" width="3.6" height="8.5" rx="1" /><path d="M13 13V6M13 3v1.5M13 13v2.5" /><rect x="11.2" y="4.5" width="3.6" height="8.5" rx="1" /><path d="M19 17v-4M19 10v1M19 17v1" /><rect x="17.2" y="11" width="3.6" height="6" rx="1" /></svg>
);
export const IconSettings = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="12" r="3" /><path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3" /></svg>
);
export const IconSearch = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
export const IconPlus = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconClose = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const IconCheck = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="m4.5 12.5 5 5L19.5 6.5" /></svg>
);
export const IconChevron = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="m9 5 7 7-7 7" /></svg>
);
export const IconFilter = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M3 5.5h18l-7 8v6l-4 2v-8Z" /></svg>
);
export const IconPlay = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M7 4.8v14.4a.6.6 0 0 0 .92.5l11.2-7.2a.6.6 0 0 0 0-1L7.92 4.3A.6.6 0 0 0 7 4.8Z" /></svg>
);
export const IconDownload = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M4 20h16" /></svg>
);
export const IconCopy = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><rect x="9" y="9" width="12" height="12" rx="2.4" /><path d="M15 5.4A2.4 2.4 0 0 0 12.6 3H5.4A2.4 2.4 0 0 0 3 5.4v7.2A2.4 2.4 0 0 0 5.4 15" /></svg>
);
export const IconTrash = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M4 6.5h16M9.5 6.5V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7M6.5 6.5l.8 12.3A1.8 1.8 0 0 0 9.1 20.5h5.8a1.8 1.8 0 0 0 1.8-1.7l.8-12.3" /></svg>
);
export const IconEdit = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" /><path d="M14.5 6 18 9.5" /></svg>
);
export const IconStar = ({ className, size, filled }: P & { filled?: boolean }) => (
  <svg {...base(size)} className={className} fill={filled ? "currentColor" : "none"}><path d="m12 3.6 2.7 5.6 6 .85-4.35 4.3 1.03 6.05L12 17.55 6.62 20.4l1.03-6.05L3.3 10.05l6-.85Z" /></svg>
);
export const IconInfo = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.6v.6" /></svg>
);
export const IconWarn = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M12 3.8 21.2 19.4a1 1 0 0 1-.86 1.5H3.66a1 1 0 0 1-.86-1.5Z" /><path d="M12 9.5v4.4M12 17.2v.5" /></svg>
);
export const IconSun = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M22 12h-2M4 12H2M18.4 5.6 17 7M7 17l-1.4 1.4M18.4 18.4 17 17M7 7 5.6 5.6" /></svg>
);
export const IconMoon = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M20 14.2A8.5 8.5 0 0 1 9.8 4 8.5 8.5 0 1 0 20 14.2Z" /></svg>
);
export const IconGroup = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><rect x="3" y="4" width="18" height="16" rx="2.5" strokeDasharray="3 2.5" /><path d="M7.5 9.5h9M7.5 14.5h5" /></svg>
);
export const IconMenu = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
);
export const IconSpinner = ({ className, size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={{ animation: "spin 800ms linear infinite" }}>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.4" fill="none" opacity="0.2" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" />
  </svg>
);
