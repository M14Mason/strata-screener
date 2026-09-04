import "server-only";

/**
 * Shared HTTP helpers for market-data providers.
 *
 * Two things every real feed forces you to handle:
 *  - rate limits, which arrive as a 429 and must be backed off rather than
 *    hammered, and
 *  - transient 5xx, which are worth one or two retries.
 *
 * Errors thrown here are written to be shown to a user: they name the provider
 * and say what to do about it, because "fetch failed" in a screener is useless.
 */

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** True when retrying later is likely to succeed. */
    readonly retryable = false
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface FetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Attempts including the first. */
  attempts?: number;
  /** Label used in error messages, e.g. "Yahoo Finance". */
  label: string;
}

/**
 * Fetch with timeout, bounded retries and exponential backoff with jitter.
 * Honours `Retry-After` when the server sends it.
 */
export async function fetchWithRetry(url: string, options: FetchOptions): Promise<Response> {
  const { headers = {}, timeoutMs = 15_000, attempts = 3, label } = options;
  let lastError: ProviderError | null = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      // 400ms, 1.2s, 3.6s ... plus jitter so parallel workers do not sync up.
      const backoff = 400 * 3 ** (attempt - 1);
      await sleep(backoff + Math.random() * 250);
    }

    let res: Response;
    try {
      res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      const aborted = error instanceof Error && error.name === "TimeoutError";
      lastError = new ProviderError(
        aborted ? `${label} timed out after ${timeoutMs / 1000}s.` : `${label} could not be reached.`,
        undefined,
        true
      );
      continue;
    }

    if (res.ok) return res;

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after"));
      if (Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter <= 30) await sleep(retryAfter * 1000);
      lastError = new ProviderError(
        `${label} is rate limiting this request (HTTP 429). Wait a moment, lower PROVIDER_CONCURRENCY, or switch to a provider with an API key.`,
        429,
        true
      );
      continue;
    }

    if (res.status >= 500) {
      lastError = new ProviderError(`${label} returned a server error (HTTP ${res.status}).`, res.status, true);
      continue;
    }

    // 4xx other than 429 will not fix themselves; fail immediately.
    throw new ProviderError(
      res.status === 401 || res.status === 403
        ? `${label} rejected the request (HTTP ${res.status}). Check that the API key is set and still valid.`
        : `${label} returned HTTP ${res.status}.`,
      res.status,
      false
    );
  }

  throw lastError ?? new ProviderError(`${label} request failed.`, undefined, true);
}

/**
 * A token bucket, so a provider never exceeds a documented rate limit.
 *
 * Polygon's free tier allows 5 requests a minute; going over gets the whole
 * key throttled, which is far more disruptive than waiting.
 */
export class RateLimiter {
  private timestamps: number[] = [];

  constructor(
    private readonly limit: number,
    private readonly windowMs: number
  ) {}

  async acquire(): Promise<void> {
    if (this.limit <= 0) return;
    for (;;) {
      const now = Date.now();
      this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
      if (this.timestamps.length < this.limit) {
        this.timestamps.push(now);
        return;
      }
      const waitMs = this.windowMs - (now - this.timestamps[0]) + 25;
      await sleep(waitMs);
    }
  }
}
