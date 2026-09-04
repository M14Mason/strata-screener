# `data/`

The prebuilt end-of-day dataset (`eod-bundle.bin`) lands here.

It is **not committed**: it is tens of megabytes and is rebuilt every weekday,
so committing it would grow the repository without bound. Instead the nightly
GitHub Action (`.github/workflows/data.yml`) builds it and publishes it as the
`data-latest` release asset, and `npm run prebuild` pulls it at build time when
`EOD_BUNDLE_URL` is set.

To build one locally:

```bash
POLYGON_API_KEY=your_key npm run data:bundle -- --sessions 320 --max-symbols 2500
npm run data:verify
```

Without a dataset the app falls back to demo data, which is clearly labelled.
