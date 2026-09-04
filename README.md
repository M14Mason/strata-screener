# Strata — stock screener & no-code strategy builder

Scan the U.S. stock market with technical and fundamental filters, build your own
screening strategies without writing code, and see exactly why each result matched.

Strata answers two questions and no others:

> **Which stocks currently match the conditions I selected?**
> **Why does this stock match my screen?**

It is a research and screening tool. There are no backtests, no buy/sell signals,
no alerts, no broker connections, no paper trading, no portfolio tracking and no
predictions. Nothing in it is investment advice.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:4321
```

That is all. With no configuration the app runs on locally generated demo data,
badged **DEMO DATA** on every screen, and every feature works.

Other scripts:

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 4321 |
| `npm run build` / `npm start` | Production build and server (`start` honours `$PORT`) |
| `npm test` | 52 engine assertions — indicators, rule semantics, scan behaviour |
| `npm run test:bundle` | 10 assertions on the dataset binary format |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run data:bundle` | Build the end-of-day dataset (needs `POLYGON_API_KEY`) |
| `npm run data:verify` | Sanity-check a built dataset before publishing |
| `npm run data:universe` | Rebuild the symbol universe from Nasdaq's public directory |
| `npm run data:profiles` | Rebuild sector / market-cap reference data |

---

## Deploying it

The app is a normal Next.js server. Two hosts it is configured for:

**Vercel** — import the repo at [vercel.com/new](https://vercel.com/new). `vercel.json`
is already set up. Zero config; it will deploy on demo data until you add a
dataset (below).

**Render** — `render.yaml` is a ready blueprint. Render runs a long-lived Node
process, which suits this app better: the indicator cache lives in memory, so the
first scan warms it and every later scan is milliseconds. A serverless host
rebuilds that cache on each cold start.

Either way, nothing has to run on your machine once it is deployed.

### Getting real market data onto a deployed instance

This is the part that deserves a straight answer.

**There is no reliable keyless bulk source of U.S. market data.** Yahoo Finance's
public chart endpoint works from a laptop but returns HTTP 429 to shared server
IPs; Stooq now sits behind a JavaScript challenge. Both were verified failing
while this was built. Any app that claims otherwise is one rate-limit away from
showing you nothing.

So real data needs a free API key, and the architecture is built around making
that cheap:

1. **Get a free Polygon.io key** — <https://polygon.io/dashboard/signup>. The free
   tier covers end-of-day data, which is all a screener needs.
2. **Add it as a repository secret** named `POLYGON_API_KEY`.
3. The nightly Action (`.github/workflows/data.yml`) builds a dataset and
   publishes it as the `data-latest` release asset.
4. **Set `EOD_BUNDLE_URL`** on your host to that asset's URL. Each build pulls the
   current dataset, and the app serves every scan from it.

The result: the deployed app makes **zero market-data API calls at request time**.
Scans are instant, the free tier is never strained, and a vendor rate-limiting
your server cannot break the site.

Why it is affordable: Polygon's grouped-daily endpoint returns *every* U.S. ticker
for one session in a single request. Building 320 sessions of history costs ~320
requests total rather than 320 × 6,000. Past sessions never change, so they are
cached between runs and a daily rebuild costs one new request.

Without a key, a deployment runs on demo data — fully functional, and honestly
labelled as simulated everywhere it appears.

---

## Market data providers

| id | Key | Use it for |
| --- | --- | --- |
| `bundle` | none at runtime | **Deployed instances.** Reads a prebuilt EOD dataset from disk. No network at request time. |
| `demo` | none | Local exploration and any deployment without a key. Deterministic synthetic prices, always badged DEMO DATA. |
| `yahoo` | none | Local use only. Real delayed bars, but rate-limits shared server IPs hard. |
| `polygon` | `POLYGON_API_KEY` | Live end-of-day data, and the source the dataset builder uses. |
| `tiingo` | `TIINGO_API_KEY` | Live adjusted end-of-day data. Per-symbol, so full-universe scans are slower. |

Set `MARKET_DATA_PROVIDER` to pick one. Leave it unset and the app uses a
prebuilt dataset if one is installed, and demo data otherwise — so a host that
ran the pipeline serves real numbers automatically, and one that did not still
boots into a working app instead of an error page.

### The reference layer is real regardless of provider

Symbols, company names, exchanges, sectors, industries and market caps are
bundled and provider-independent, sourced from two public non-price feeds:

- [Nasdaq Trader symbol directory](https://www.nasdaqtrader.com/dynamic/SymDir/) —
  11,939 listings (6,312 common stocks, 5,627 ETFs) across NYSE, NASDAQ and AMEX.
- Nasdaq's public stock-screener download — sector, industry, market cap, country
  and IPO year for 6,697 symbols.

Refresh with `npm run data:universe && npm run data:profiles`.

### Data honesty

Requirements the app enforces structurally, not by convention:

- Every provider declares a `freshness` object (`isDemo`, `latency`, `note`), and
  it travels in the same response as the prices. Nothing can render a number
  without the badge that describes it.
- Demo mode shows a permanent amber **DEMO DATA** banner and badge.
- Delayed data says "delayed". End-of-day data says "end of day". Neither is ever
  described as real time.
- A fundamental the provider does not supply renders as `--` with a footnote
  naming the provider. Never defaulted to zero, never quietly dropped.
- A ticker that is not a real U.S. listing returns 404 rather than a page of
  plausible-looking generated numbers.

---

## Architecture

```
src/
  lib/
    indicators/index.ts    Pure indicator maths. No I/O, no React. Single source
                           of truth for SMA, EMA, RSI, MACD, Bollinger, ATR, ADX,
                           Stochastic, VWAP, momentum, rolling extremes, crossovers.
    data/
      types.ts             MarketDataProvider interface + shared types
      provider.ts          Provider registry (one line per source)
      http.ts              Retry with backoff, and a token bucket for rate limits
      bundle-format.ts     Binary layout of the EOD dataset
      bundle.ts            Reads the dataset; the provider a deployment uses
      demo.ts | yahoo.ts | polygon.ts | tiingo.ts
      reference.ts         Bundled universe + sector/market-cap profiles
      cache.ts             Two-tier (memory + disk) cache, bounded worker pool
    engine/
      snapshot.ts          Precomputes every indicator per symbol, keeping 25
                           trailing days so multi-day conditions are array lookups
      metrics.ts           Metric resolution, incl. lazily computed custom periods
      fields.ts            Filter catalog: drives builder dropdowns, filter search
                           and the server evaluator from one definition
      recipes.ts           Ready-made conditions ("RSI crossover", "golden cross")
      rules.ts             Rule tree types, evaluator, validator, explainer
      presets.ts           Prebuilt strategy library + quick-screen chips
      filters.ts           Universe + basic filters (client-safe)
      store.ts             Per-session snapshot cache
      scan.ts              Scan orchestration and result rows
  app/
    api/screen | stock/[symbol] | market | search | status | health
    (dashboard) | screener | strategies | watchlists | settings | stock/[symbol]
  components/              UI, split by surface
scripts/
  build-universe.mjs       Symbol directory -> src/data/universe.json
  build-profiles.mjs       Sector / market cap -> src/data/profiles.json
  build-bundle.mts         Polygon grouped-daily -> data/eod-bundle.bin
  fetch-bundle.mts         Pulls the published dataset at build time
  bundle-verify.mts        Refuses to publish a corrupt or stale dataset
  engine-test.mts          52 engine assertions
  bundle-test.mts          10 dataset-format assertions
```

### Why scanning thousands of symbols is fast

The work is ordered so the expensive part runs on as few symbols as possible, and
only once:

1. **Reference-only prefilter.** Exchange, ETF flag, sector and market cap are all
   decidable from bundled data, so they are applied *before* any price is touched.
2. **Bulk read.** Bars come from the dataset in one pass (or a provider's batch
   path, through a bounded concurrency pool with retry and rate limiting).
3. **Precomputed snapshots.** Indicator maths runs once per symbol per session and
   stays in memory. Evaluating a strategy against 6,000 snapshots is then array
   lookups and comparisons.
4. **Server-side only.** The browser holds the request and the returned rows —
   never the universe, never the bar history.

Measured on the demo provider, full universe of 6,312 common stocks:

| | |
| --- | --- |
| Cold scan, building every snapshot | ~6 s |
| Warm re-scan (any filter or strategy change) | **15–60 ms** |
| A preset strategy across the whole universe | 25–60 ms |

Because re-scans are that cheap, the result count updates live as you edit filters
instead of waiting for a Scan press.

---

## What is fully implemented

**Screener** — 11,939 listings scoped to All / NASDAQ / NYSE / AMEX / ETFs / a
watchlist. ETFs and low-priced stocks excluded by default, both toggleable, penny
threshold adjustable. Price, market cap (5 tiers + custom range), volume (average,
dollar, today), sector, beta, dividend yield, P/E and EPS filters, all optional.
12 quick-screen chips. Live result count, Clear all, Save screen, CSV export, copy
to clipboard. Sortable / hideable / reorderable columns (25 available).

**Strategy builder** — indicator → period → condition → value → when, no syntax.
AND / OR / NOT per group, groups nest, NOT also available per condition. Filter
search across 47 indicators and 63 ready-made conditions, so typing "rsi" surfaces
RSI, RSI crossover, RSI range and RSI oversold/overbought. Multi-day conditions:
today, N trading days ago, or within the last N trading days. Save, rename,
duplicate, delete, plus a 16-entry prebuilt library across Trend, Mean Reversion,
Momentum, Pullbacks and Volatility — each copyable and editable.

**Indicators** — SMA (5/10/20/50/100/150/200 + custom), EMA (5/10/20/50/100/200 +
custom), RSI (2/3/5/7/9/14/21 + custom), MACD, Bollinger with width and %B, ATR and
ATR %, ADX with DI+/DI−, Stochastic %K/%D, rolling VWAP, relative volume, momentum
over 1/5/10/20/50/63/126/252 days, 52-week extremes and new highs/lows, gaps,
consecutive up/down days, higher-high / higher-low / lower-high / lower-low.

**Operators** — above, at-or-above, below, at-or-below, between, crosses above,
crosses below, within X% of, rising, falling, is / is-not true. Every one can
compare against a number *or* another indicator.

**Results** — sortable desktop table with in-row match explanation; mobile cards
with a stat grid, match summary and Why expander.

**"Why does this match?"** — a per-condition trace with the actual value and the
threshold ("RSI(2) = 4.37, is below 10.00"). Group logic is rendered honestly:
inside an ANY group, an unmet condition shows as unmet without invalidating the
match. A test asserts no explanation can contain recommendation language.

**Stock page** — header with price, change, market cap, sector, beta, P/E, EPS and
dividend yield; interactive canvas candlestick chart with 9 timeframes, six
toggleable overlays and three sub-panes (volume, RSI with selectable period, MACD),
crosshair and OHLCV tooltip; 24 technical readings; 15 fundamentals with explicit
unavailability.

**Watchlists** — create, rename, delete, add/remove with type-ahead search, quoted
table on desktop and cards on mobile, and "Screen this list" to use a watchlist as
the screener universe.

**Mobile** — bottom navigation, filters and the full builder in a bottom sheet,
result cards, scrolling quick screens, sticky floating Scan button, safe-area
handling, and container-query layouts so the condition editor responds to its own
width rather than the viewport's.

**Also** — dark and light themes with no flash on load, local persistence with JSON
export/import, `/api/health` for host health checks, and a settings page reporting
the active provider, dataset state, universe counts and cache state.

### Testing

`npm test` — 52 assertions: RSI against Wilder's reference series *and* an
independently written implementation; rolling extremes against brute force;
filter enforcement; every preset strategy re-verified against its own snapshot;
AND/OR/NOT set algebra (`NOT` is an exact complement; `NONE` is the exact
complement of `ANY`); crossovers as strict subsets of the level condition;
`withinPct` band membership; `rising`/`falling`; today vs yesterday vs
within-last-N; custom indicator periods; sort order; universe scoping; and that
malformed or hostile rule input fails closed.

`npm run test:bundle` — 10 assertions on the dataset format: price round-trip
accuracy, volume scaling, missing-session handling, batch/single agreement,
lookback windows, and that a corrupt file fails loudly rather than silently
decoding garbage.

Both run in CI on every push (`.github/workflows/ci.yml`), alongside a typecheck
and a production build.

---

## What remains

- **Authentication.** Strategies, watchlists and settings live in `localStorage`
  under one namespaced key. The store is a single module
  (`src/lib/client/store.tsx`) whose shapes already match what an API would
  return, so adding accounts means swapping the read/write functions there.
- **Fundamental coverage** depends on the provider. `demo` supplies all 15 figures;
  `polygon` supplies revenue and EPS from its financials endpoint; `bundle`,
  `yahoo` and `tiingo` supply market cap only. The UI marks the gaps.
- **Intraday data.** Everything is daily bars, so VWAP is a 20-day rolling
  volume-weighted average (labelled as such) and the 1D/5D chart ranges show daily
  candles.
- **Live full-universe scans on network providers** are capped at 1,200 symbols by
  default, and the UI says so when a scan was capped. The `bundle` provider has no
  such limit.
- **Drag-and-drop column reordering** — arrow buttons today.

---

## Extending it

### Add an indicator

1. **Compute it** in `src/lib/indicators/index.ts` as a pure function returning an
   array aligned to the input bars, `null` where undefined.
2. **Add it to the snapshot** in `src/lib/engine/snapshot.ts`:
   ```ts
   m.cci20 = trail(cci(h, l, c, 20));
   ```
3. **Declare it** in `src/lib/engine/fields.ts`:
   ```ts
   {
     id: "cci",
     label: "CCI (20)",
     group: "Oscillators",
     metric: "cci20",
     unit: "number",
     operators: LEVEL_OPS,
     keywords: ["cci", "commodity channel", "oscillator"],
     defaultValue: -100,
   }
   ```

That one entry drives the builder dropdowns, the filter search, the server
evaluator and the explanation text. For a parameterised indicator use
``metric: (p) => `cci${p}` `` with a `periods` array; set `allowCustomPeriod: true`
and add the prefix to the regex in `src/lib/engine/metrics.ts` to let users type
their own period.

Optionally add a plain-language entry to `src/lib/engine/recipes.ts`, and a column
to `src/components/screener/columns.ts` for the results table and CSV.

### Change the market-data provider

To switch between the five that ship: set `MARKET_DATA_PROVIDER` and restart.

To add one:

1. Implement `MarketDataProvider` (`src/lib/data/types.ts`) — `getUniverse`,
   `getProfiles`, `getQuote`, `getHistoricalPrices`, `getHistoricalPricesBatch`,
   `getFundamentals`, plus `id` / `label` / `freshness`. Override the batch method
   if your source has a bulk endpoint; that is where whole-market scan performance
   is won or lost.
2. Register it in `src/lib/data/provider.ts`:
   ```ts
   const FACTORIES = { ..., alpaca: () => new AlpacaProvider() };
   ```
3. Set `MARKET_DATA_PROVIDER=alpaca` and read the key from `process.env` inside the
   provider.

No file above the data layer imports a vendor URL or SDK. Use `fetchWithRetry` and
`RateLimiter` from `src/lib/data/http.ts`, and set `freshness.latency` and
`freshness.note` truthfully — that object is what the UI tells the user about their
data.

---

## Security

- API keys are read from `process.env` inside server-only modules
  (`import "server-only"`) and are never serialised into a response. Tiingo's token
  goes in a header rather than a query string so it cannot land in a proxy log.
- Rule trees are pure data, evaluated by a switch over a fixed operator set. There
  is **no `eval`, no `new Function`, no expression string** anywhere between a
  saved strategy and a result.
- `parseScreenRequest` and `validateRuleNode` normalise every request: unknown
  fields and operators dropped, periods clamped to 1–400, lookbacks to retained
  history, nesting to six levels, 40 children per group, 1,000 result rows.
  Anything unrecognised fails closed.
- Field lookup goes through a `null`-prototype map, so a crafted
  `field: "__proto__"` resolves to nothing rather than `Object.prototype`.

## Terminology

The app says *screen*, *matches*, *candidate*, *meets criteria*, *technical setup*,
*historical condition*. It does not say *guaranteed*, *sure thing*, *will go up*,
*buy now* or *winner* — and a test asserts that none of that language can appear in
a generated explanation.

## Licence

MIT.
