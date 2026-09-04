"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { BasicFilters, ScreenRequest, SortSpec, UniverseSpec } from "@/lib/engine/filters";
import { DEFAULT_SORT, DEFAULT_UNIVERSE } from "@/lib/engine/filters";
import type { RuleGroup } from "@/lib/engine/rules";

/**
 * Local persistence for saved strategies, watchlists and settings.
 *
 * Everything lives in localStorage and is namespaced under one key, which keeps
 * the MVP free of an account system. The shapes below are the same ones an API
 * would return, so moving this to a signed-in backend later means swapping the
 * read/write functions in this file and nothing else.
 */

const STORAGE_KEY = "strata.v1";
const SCHEMA_VERSION = 1;

export interface SavedStrategy {
  id: string;
  name: string;
  description?: string;
  rules: RuleGroup;
  filters: BasicFilters;
  universe: UniverseSpec;
  sort: SortSpec;
  /** Set when the strategy was copied out of the prebuilt library. */
  basedOn?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Watchlist {
  id: string;
  name: string;
  symbols: string[];
  createdAt: number;
  updatedAt: number;
}

export type ThemeMode = "dark" | "light";

export interface Settings {
  theme: ThemeMode;
  /** Result-table columns, in display order. */
  columns: string[];
  resultLimit: number;
  /** Show the confirmation dialog before deleting saved items. */
  confirmDeletes: boolean;
}

export const DEFAULT_COLUMNS = [
  "symbol",
  "name",
  "price",
  "changePct",
  "volume",
  "relVolume",
  "marketCap",
  "rsi2",
  "rsi14",
  "sma50",
  "sma200",
  "distSma50",
  "distSma200",
  "sector",
];

const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  columns: DEFAULT_COLUMNS,
  resultLimit: 200,
  confirmDeletes: true,
};

interface StoreShape {
  version: number;
  strategies: SavedStrategy[];
  watchlists: Watchlist[];
  settings: Settings;
  /** The screen the user was last building, restored on return. */
  draft: ScreenRequest | null;
}

const EMPTY: StoreShape = {
  version: SCHEMA_VERSION,
  strategies: [],
  watchlists: [],
  settings: DEFAULT_SETTINGS,
  draft: null,
};

function read(): StoreShape {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    return {
      version: SCHEMA_VERSION,
      strategies: Array.isArray(parsed.strategies) ? parsed.strategies : [],
      watchlists: Array.isArray(parsed.watchlists) ? parsed.watchlists : [],
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      draft: parsed.draft ?? null,
    };
  } catch {
    // Corrupt storage should not brick the app; start clean instead.
    return EMPTY;
  }
}

function write(state: StoreShape) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota or private-mode failures are non-fatal - the session still works.
  }
}

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

interface StoreApi {
  ready: boolean;
  strategies: SavedStrategy[];
  watchlists: Watchlist[];
  settings: Settings;
  draft: ScreenRequest | null;

  saveStrategy(input: Omit<SavedStrategy, "id" | "createdAt" | "updatedAt"> & { id?: string }): SavedStrategy;
  renameStrategy(id: string, name: string): void;
  duplicateStrategy(id: string): SavedStrategy | null;
  deleteStrategy(id: string): void;
  getStrategy(id: string): SavedStrategy | undefined;

  createWatchlist(name: string, symbols?: string[]): Watchlist;
  renameWatchlist(id: string, name: string): void;
  deleteWatchlist(id: string): void;
  addToWatchlist(id: string, symbol: string): void;
  removeFromWatchlist(id: string, symbol: string): void;
  isOnAnyWatchlist(symbol: string): boolean;

  updateSettings(patch: Partial<Settings>): void;
  setDraft(draft: ScreenRequest | null): void;
  exportAll(): string;
  importAll(json: string): boolean;
  resetAll(): void;
}

const StoreContext = createContext<StoreApi | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoreShape>(EMPTY);
  const [ready, setReady] = useState(false);

  // Hydrate after mount so server and client markup match on first paint.
  useEffect(() => {
    setState(read());
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) write(state);
  }, [state, ready]);

  // Theme is applied to the document root so CSS variables can switch.
  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.theme = state.settings.theme;
  }, [state.settings.theme, ready]);

  const api = useMemo<StoreApi>(() => {
    const update = (fn: (s: StoreShape) => StoreShape) => setState((prev) => fn(prev));

    return {
      ready,
      strategies: state.strategies,
      watchlists: state.watchlists,
      settings: state.settings,
      draft: state.draft,

      saveStrategy(input) {
        const now = Date.now();
        let saved: SavedStrategy;
        update((s) => {
          const existing = input.id ? s.strategies.find((x) => x.id === input.id) : undefined;
          saved = {
            ...input,
            id: existing?.id ?? input.id ?? newId(),
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
          } as SavedStrategy;
          return {
            ...s,
            strategies: existing
              ? s.strategies.map((x) => (x.id === saved.id ? saved : x))
              : [saved, ...s.strategies],
          };
        });
        // `saved` is assigned synchronously inside the updater above.
        return saved!;
      },

      renameStrategy(id, name) {
        update((s) => ({
          ...s,
          strategies: s.strategies.map((x) => (x.id === id ? { ...x, name, updatedAt: Date.now() } : x)),
        }));
      },

      duplicateStrategy(id) {
        const source = state.strategies.find((x) => x.id === id);
        if (!source) return null;
        const copy: SavedStrategy = {
          ...source,
          id: newId(),
          name: `${source.name} (copy)`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        update((s) => ({ ...s, strategies: [copy, ...s.strategies] }));
        return copy;
      },

      deleteStrategy(id) {
        update((s) => ({ ...s, strategies: s.strategies.filter((x) => x.id !== id) }));
      },

      getStrategy(id) {
        return state.strategies.find((x) => x.id === id);
      },

      createWatchlist(name, symbols = []) {
        const list: Watchlist = {
          id: newId(),
          name,
          symbols: [...new Set(symbols.map((s) => s.toUpperCase()))],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        update((s) => ({ ...s, watchlists: [...s.watchlists, list] }));
        return list;
      },

      renameWatchlist(id, name) {
        update((s) => ({
          ...s,
          watchlists: s.watchlists.map((w) => (w.id === id ? { ...w, name, updatedAt: Date.now() } : w)),
        }));
      },

      deleteWatchlist(id) {
        update((s) => ({ ...s, watchlists: s.watchlists.filter((w) => w.id !== id) }));
      },

      addToWatchlist(id, symbol) {
        const sym = symbol.toUpperCase();
        update((s) => ({
          ...s,
          watchlists: s.watchlists.map((w) =>
            w.id === id && !w.symbols.includes(sym)
              ? { ...w, symbols: [...w.symbols, sym], updatedAt: Date.now() }
              : w
          ),
        }));
      },

      removeFromWatchlist(id, symbol) {
        const sym = symbol.toUpperCase();
        update((s) => ({
          ...s,
          watchlists: s.watchlists.map((w) =>
            w.id === id ? { ...w, symbols: w.symbols.filter((x) => x !== sym), updatedAt: Date.now() } : w
          ),
        }));
      },

      isOnAnyWatchlist(symbol) {
        const sym = symbol.toUpperCase();
        return state.watchlists.some((w) => w.symbols.includes(sym));
      },

      updateSettings(patch) {
        update((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
      },

      setDraft(draft) {
        update((s) => ({ ...s, draft }));
      },

      exportAll() {
        return JSON.stringify(state, null, 2);
      },

      importAll(json) {
        try {
          const parsed = JSON.parse(json) as Partial<StoreShape>;
          if (!parsed || typeof parsed !== "object") return false;
          setState({
            version: SCHEMA_VERSION,
            strategies: Array.isArray(parsed.strategies) ? parsed.strategies : [],
            watchlists: Array.isArray(parsed.watchlists) ? parsed.watchlists : [],
            settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
            draft: parsed.draft ?? null,
          });
          return true;
        } catch {
          return false;
        }
      },

      resetAll() {
        setState(EMPTY);
      },
    };
  }, [state, ready]);

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}

/** Convenience for the screener's default request shape. */
export function defaultScreen(): ScreenRequest {
  return {
    universe: { ...DEFAULT_UNIVERSE },
    filters: {},
    rules: { kind: "group", id: newId(), logic: "all", children: [] },
    sort: { ...DEFAULT_SORT },
    limit: 200,
  };
}

/** Small hook for "copy to clipboard" affordances with a transient confirmation. */
export function useCopied(timeout = 1600) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), timeout);
        return true;
      } catch {
        return false;
      }
    },
    [timeout]
  );
  return { copied, copy };
}
