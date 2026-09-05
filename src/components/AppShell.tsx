"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/client/store";
import {
  IconDashboard,
  IconMoon,
  IconScreener,
  IconSearch,
  IconSettings,
  IconStock,
  IconStrategy,
  IconSun,
  IconWatchlist,
} from "./ui/Icons";

/**
 * The application frame: a rail on desktop, a bottom bar on phones.
 *
 * The two navigations are separate markup rather than one responsive list --
 * requirement 28 is explicit that mobile should not be a shrunken desktop, and
 * the touch layout needs its own hit targets, ordering and safe-area handling.
 */

const NAV = [
  { href: "/", label: "Dashboard", Icon: IconDashboard },
  { href: "/screener", label: "Screener", Icon: IconScreener },
  { href: "/strategies", label: "Strategies", Icon: IconStrategy },
  { href: "/watchlists", label: "Watchlists", Icon: IconWatchlist },
  { href: "/settings", label: "Settings", Icon: IconSettings },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { settings, updateSettings, ready } = useStore();

  return (
    <div className="relative z-10 flex min-h-dvh">
      {/* ---------------------------------------------------------- desktop */}
      <aside className="sticky top-0 hidden h-dvh w-[228px] shrink-0 flex-col border-r px-3 py-4 md:flex" style={{ background: "var(--bg-elevated)" }}>
        <Link href="/" className="mb-6 flex items-center gap-2.5 px-2">
          <Mark />
          <span className="text-[15px] font-semibold tracking-tight">Strata</span>
        </Link>

        <nav className="flex flex-col gap-0.5">
          {NAV.map(({ href, label, Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className="relative flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13.5px] font-medium transition-colors"
                style={{ color: active ? "var(--text)" : "var(--text-muted)" }}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-[10px]"
                    style={{ background: "var(--accent-soft)", border: "1px solid var(--accent-border)" }}
                    transition={{ type: "spring", stiffness: 480, damping: 38 }}
                  />
                )}
                <span className="relative" style={{ color: active ? "var(--accent)" : "inherit" }}>
                  <Icon size={18} />
                </span>
                <span className="relative">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-2 px-1">
          <ThemeToggle
            theme={settings.theme}
            ready={ready}
            onToggle={() => updateSettings({ theme: settings.theme === "dark" ? "light" : "dark" })}
          />
          <p className="px-1 text-[10.5px] leading-relaxed faint">
            Screening and research only. Not investment advice.
          </p>
        </div>
      </aside>

      {/* ------------------------------------------------------------- main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="pb-bottom-nav min-w-0 flex-1">{children}</main>
      </div>

      {/* ----------------------------------------------------------- mobile */}
      <nav
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 flex border-t md:hidden"
        style={{ background: "color-mix(in srgb, var(--bg-elevated) 92%, transparent)", backdropFilter: "blur(14px)" }}
      >
        {NAV.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className="relative flex min-h-[var(--bottom-nav-h)] flex-1 flex-col items-center justify-center gap-1 px-1 pt-1.5 text-[10.5px] font-medium"
              style={{ color: active ? "var(--accent)" : "var(--text-faint)" }}
            >
              {active && (
                <motion.span
                  layoutId="nav-active-mobile"
                  className="absolute inset-x-3 top-0 h-[2px] rounded-full"
                  style={{ background: "var(--accent)" }}
                  transition={{ type: "spring", stiffness: 480, damping: 38 }}
                />
              )}
              <Icon size={20} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function Mark() {
  return (
    <span
      className="grid h-8 w-8 place-items-center rounded-[9px]"
      style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
        <path d="M4 7h16M7 12h10M10.5 17h3" />
      </svg>
    </span>
  );
}

function ThemeToggle({ theme, onToggle, ready }: { theme: string; onToggle: () => void; ready: boolean }) {
  return (
    <button className="btn btn-ghost w-full justify-start !px-3" onClick={onToggle} aria-label="Toggle colour theme">
      {/* Render a stable icon until the stored preference is read, so the server
          and client markup agree on first paint. */}
      {!ready || theme === "dark" ? <IconMoon size={17} /> : <IconSun size={17} />}
      <span className="text-[13px]">{!ready || theme === "dark" ? "Dark" : "Light"} mode</span>
    </button>
  );
}

/** Header with the global symbol search. */
function TopBar() {
  const pathname = usePathname();
  const { settings, updateSettings, ready } = useStore();
  const title = NAV.find((n) => isActive(pathname, n.href))?.label ?? (pathname.startsWith("/stock") ? "Stock" : "Strata");

  return (
    <header
      className="sticky top-0 z-30 flex h-[58px] items-center gap-3 border-b px-4 md:px-6"
      style={{ background: "color-mix(in srgb, var(--bg) 86%, transparent)", backdropFilter: "blur(14px)" }}
    >
      <Link href="/" className="flex items-center gap-2 md:hidden">
        <Mark />
      </Link>
      <h1 className="hidden text-[15px] font-semibold md:block">{title}</h1>
      <div className="ml-auto flex w-full max-w-[420px] items-center gap-2">
        <SymbolSearch />
        <button
          className="btn btn-ghost !px-2 md:hidden"
          onClick={() => updateSettings({ theme: settings.theme === "dark" ? "light" : "dark" })}
          aria-label="Toggle colour theme"
        >
          {!ready || settings.theme === "dark" ? <IconMoon size={17} /> : <IconSun size={17} />}
        </button>
      </div>
    </header>
  );
}

interface SearchHit {
  symbol: string;
  name: string;
  exchange: string;
  isEtf: boolean;
  sector: string | null;
}

function SymbolSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced lookup; an in-flight request is abandoned when the query moves on.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const json = await res.json();
        setHits(json.results ?? []);
        setCursor(0);
      } catch {
        /* aborted or offline - leave the previous hits in place */
      }
    }, 130);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const go = (symbol: string) => {
    setOpen(false);
    setQuery("");
    router.push(`/stock/${symbol}`);
  };

  return (
    <div ref={boxRef} className="relative w-full">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 faint">
        <IconSearch size={15} />
      </span>
      <input
        className="input !pl-9"
        placeholder="Search symbol or company"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setCursor((c) => Math.min(c + 1, hits.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
          } else if (e.key === "Enter") {
            const pick = hits[cursor];
            if (pick) go(pick.symbol);
            else if (query.trim()) go(query.trim().toUpperCase());
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      <AnimatePresence>
        {open && hits.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.13 }}
            className="absolute right-0 top-[calc(100%+6px)] z-50 max-h-[340px] w-full min-w-[300px] overflow-y-auto rounded-xl border py-1"
            style={{ background: "var(--bg-elevated)", boxShadow: "var(--shadow-pop)" }}
          >
            {hits.map((hit, i) => (
              <li key={hit.symbol}>
                <button
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors"
                  style={{ background: i === cursor ? "var(--surface-hover)" : "transparent" }}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(hit.symbol)}
                >
                  <span className="w-[58px] shrink-0 text-[13px] font-semibold">{hit.symbol}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] muted">{hit.name}</span>
                  <span className="shrink-0 text-[10.5px] faint">{hit.isEtf ? "ETF" : hit.exchange}</span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
