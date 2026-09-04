import "server-only";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * A tiny two-tier cache: an in-process map in front of newline-delimited JSON
 * on disk. Bars for a symbol change once a day, so re-fetching them on every
 * scan would be both slow and rude to the provider.
 */

const DIR = path.resolve(process.cwd(), process.env.DATA_CACHE_DIR || ".cache");

const memory = new Map<string, { expires: number; value: unknown }>();

function fileFor(key: string) {
  // Keys are provider/scope/symbol style; keep them filesystem-safe.
  return path.join(DIR, `${key.replace(/[^a-zA-Z0-9._-]/g, "_")}.json`);
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const hit = memory.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;

  try {
    const raw = await fs.readFile(fileFor(key), "utf8");
    const parsed = JSON.parse(raw) as { expires: number; value: T };
    if (parsed.expires > Date.now()) {
      memory.set(key, parsed);
      return parsed.value;
    }
  } catch {
    // Miss, unreadable, or corrupt -- all mean "fetch it again".
  }
  return null;
}

export async function cacheSet<T>(key: string, value: T, ttlMs: number): Promise<void> {
  const entry = { expires: Date.now() + ttlMs, value };
  memory.set(key, entry);
  try {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(fileFor(key), JSON.stringify(entry));
  } catch {
    // Disk cache is an optimisation; losing it must never fail a request.
  }
}

export function memoGet<T>(key: string): T | null {
  const hit = memory.get(key);
  return hit && hit.expires > Date.now() ? (hit.value as T) : null;
}

export function memoSet<T>(key: string, value: T, ttlMs: number): void {
  memory.set(key, { expires: Date.now() + ttlMs, value });
}

/** Milliseconds until the next 4:15pm ET, so EOD data is cached exactly once a day. */
export function msUntilNextClose(): number {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const target = new Date(et);
  target.setHours(16, 15, 0, 0);
  if (et >= target) target.setDate(target.getDate() + 1);
  return Math.max(60_000, target.getTime() - et.getTime());
}

/** Run `worker` over `items` with a bounded number in flight at once. */
export async function pool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  let done = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        results[i] = await worker(items[i], i);
      } catch {
        results[i] = undefined as R;
      }
      done++;
      if (onProgress && done % 25 === 0) onProgress(done, items.length);
    }
  });

  await Promise.all(runners);
  onProgress?.(items.length, items.length);
  return results;
}
