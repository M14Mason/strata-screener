"use client";

import { useEffect, useRef, useState } from "react";
import { fetchStatus, downloadText, type StatusResponse } from "@/lib/client/api";
import { DEFAULT_COLUMNS, useStore } from "@/lib/client/store";
import { NA, fmtDate } from "@/lib/client/format";
import { DataBadge } from "@/components/DataBadge";
import { ConfirmButton, Field, Select, Skeleton, Toggle } from "@/components/ui/Primitives";
import { IconDownload, IconWarn } from "@/components/ui/Icons";

/** Settings: data provider status, display preferences, and local-data control. */
export default function SettingsClient() {
  const { settings, updateSettings, strategies, watchlists, exportAll, importAll, resetAll, ready } = useStore();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchStatus()
      .then(setStatus)
      .catch((e) => setStatusError(e instanceof Error ? e.message : "Could not read status"));
  }, []);

  return (
    <div className="flex max-w-3xl flex-col gap-4 px-4 py-4 md:px-6 md:py-5">
      {/* ------------------------------------------------------ data source */}
      <section className="card px-4 py-4 md:px-5">
        <h2 className="text-[15px] font-semibold">Market data</h2>
        <p className="mt-0.5 text-[12px] muted">
          The provider is chosen on the server through the{" "}
          <code className="rounded px-1 py-0.5 text-[11px]" style={{ background: "var(--surface-sunken)" }}>
            MARKET_DATA_PROVIDER
          </code>{" "}
          environment variable, so API keys never reach the browser.
        </p>

        {statusError ? (
          <p className="mt-3 flex items-start gap-2 text-[13px] muted">
            <span style={{ color: "var(--warn)" }}>
              <IconWarn size={15} />
            </span>
            {statusError}
          </p>
        ) : !status ? (
          <Skeleton className="mt-3 h-[120px]" />
        ) : (
          <>
            <div className="mt-3.5 flex flex-wrap items-center gap-3 border-t pt-3">
              <div>
                <p className="label !mb-1">Active provider</p>
                <p className="text-[15px] font-semibold">{status.provider.label}</p>
              </div>
              <div className="ml-auto">
                <DataBadge freshness={status.freshness} />
              </div>
            </div>

            <p className="mt-1.5 text-[12px] muted">{status.freshness.note}</p>

            <div className="mt-3">
              <p className="label">Available providers</p>
              <ul className="flex flex-col gap-1.5">
                {status.provider.available.map((id) => {
                  const active = id === status.provider.id;
                  return (
                    <li
                      key={id}
                      className="rounded-[10px] border px-3 py-2"
                      style={{
                        background: active ? "var(--accent-soft)" : "var(--surface-sunken)",
                        borderColor: active ? "var(--accent-border)" : "var(--border)",
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <code className="text-[12.5px] font-semibold" style={{ color: active ? "var(--accent)" : "var(--text)" }}>
                          {id}
                        </code>
                        {active && (
                          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
                            active
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11.5px] leading-snug muted">{status.provider.notes[id]}</p>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-[11.5px] leading-relaxed faint">
                To switch, set{" "}
                <code className="rounded px-1" style={{ background: "var(--surface-sunken)" }}>
                  MARKET_DATA_PROVIDER=&lt;id&gt;
                </code>{" "}
                in <code className="rounded px-1" style={{ background: "var(--surface-sunken)" }}>.env.local</code> (or in
                your host&rsquo;s environment settings) and restart.
                {!status.provider.configured && " Nothing is configured, so the app picked a provider automatically."}
              </p>
            </div>

            {/* The prebuilt dataset is what a deployed instance should serve
                from, so its state is worth showing plainly. */}
            <div className="mt-4 border-t pt-3">
              <p className="label">Prebuilt end-of-day dataset</p>
              {status.dataset.present ? (
                <>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-4">
                    <Stat label="Symbols" value={(status.dataset.symbols ?? 0).toLocaleString()} />
                    <Stat label="Sessions" value={String(status.dataset.sessions ?? 0)} />
                    <Stat label="Latest close" value={fmtDate(status.dataset.asOf ?? null)} />
                    <Stat
                      label="File size"
                      value={status.dataset.sizeBytes ? `${(status.dataset.sizeBytes / 1e6).toFixed(1)} MB` : NA}
                    />
                  </dl>
                  <p className="mt-2 text-[11.5px] leading-relaxed faint">
                    Scans read straight from this file — no market-data API is called while you use the app.
                  </p>
                </>
              ) : (
                <p className="text-[12px] leading-relaxed muted">
                  {status.dataset.error
                    ? `The dataset could not be read: ${status.dataset.error}`
                    : "No dataset is installed."}{" "}
                  Build one with{" "}
                  <code className="rounded px-1" style={{ background: "var(--surface-sunken)" }}>
                    npm run data:bundle
                  </code>{" "}
                  (needs a free Polygon key), or let the nightly GitHub Action build and publish it.
                </p>
              )}
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 border-t pt-3 text-[13px] sm:grid-cols-3">
              <Stat label="Listings" value={status.universe.total.toLocaleString()} />
              <Stat label="Common stocks" value={status.universe.stocks.toLocaleString()} />
              <Stat label="ETFs" value={status.universe.etfs.toLocaleString()} />
              <Stat label="NASDAQ" value={status.universe.nasdaq.toLocaleString()} />
              <Stat label="NYSE" value={status.universe.nyse.toLocaleString()} />
              <Stat label="AMEX" value={status.universe.amex.toLocaleString()} />
            </dl>
            <p className="mt-2 text-[11.5px] faint">
              Universe built {fmtDate(Date.parse(status.universe.builtAt))} · reference profiles built{" "}
              {fmtDate(Date.parse(status.universe.profilesBuiltAt))}. Refresh them with{" "}
              <code className="rounded px-1" style={{ background: "var(--surface-sunken)" }}>
                npm run data:universe
              </code>{" "}
              and{" "}
              <code className="rounded px-1" style={{ background: "var(--surface-sunken)" }}>
                npm run data:profiles
              </code>
              .
            </p>

            {status.cache.symbols > 0 && (
              <p className="mt-2 text-[11.5px] faint">
                Indicator cache: {status.cache.withData.toLocaleString()} of {status.cache.symbols.toLocaleString()}{" "}
                symbols have usable history for session {status.cache.session}.
              </p>
            )}
          </>
        )}
      </section>

      {/* --------------------------------------------------------- display */}
      <section className="card px-4 py-4 md:px-5">
        <h2 className="mb-2 text-[15px] font-semibold">Display</h2>
        <div className="flex flex-col divide-y">
          <div className="py-1">
            <Toggle
              label="Dark mode"
              hint="Applies immediately and is remembered on this device"
              checked={settings.theme === "dark"}
              onChange={(v) => updateSettings({ theme: v ? "dark" : "light" })}
            />
          </div>
          <div className="py-3">
            <Field label="Results per scan" hint="How many matching rows the table shows. The match count always reflects every match, not just the rows shown.">
              <Select
                ariaLabel="Results per scan"
                value={settings.resultLimit}
                options={[50, 100, 200, 500, 1000].map((n) => ({ value: n, label: `${n} rows` }))}
                onChange={(v) => updateSettings({ resultLimit: v as number })}
              />
            </Field>
          </div>
          <div className="py-3">
            <p className="label">Result columns</p>
            <p className="mb-2 text-[12px] muted">
              {settings.columns.length} columns shown. Change them from the Columns button on the screener.
            </p>
            <button className="btn !py-1.5 text-[12.5px]" onClick={() => updateSettings({ columns: DEFAULT_COLUMNS })}>
              Reset columns to default
            </button>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- saved data */}
      <section className="card px-4 py-4 md:px-5">
        <h2 className="text-[15px] font-semibold">Your saved data</h2>
        <p className="mt-0.5 text-[12px] muted">
          Strategies, watchlists and settings are stored in this browser only — there is no account and nothing is sent
          to a server. Export a copy to move them to another device.
        </p>

        <dl className="mt-3 flex gap-6 border-t pt-3 text-[13px]">
          <Stat label="Strategies" value={ready ? String(strategies.length) : "…"} />
          <Stat label="Watchlists" value={ready ? String(watchlists.length) : "…"} />
          <Stat
            label="Symbols tracked"
            value={ready ? String(new Set(watchlists.flatMap((w) => w.symbols)).size) : "…"}
          />
        </dl>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            className="btn"
            onClick={() =>
              downloadText(
                `strata-backup-${new Date().toISOString().slice(0, 10)}.json`,
                exportAll(),
                "application/json"
              )
            }
          >
            <IconDownload size={15} />
            Export
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const text = await file.text();
              setImportMessage(
                importAll(text)
                  ? "Imported. Your strategies and watchlists have been replaced."
                  : "That file could not be read as a Strata backup."
              );
              e.target.value = "";
            }}
          />
          <ConfirmButton
            className="btn btn-danger ml-auto"
            onConfirm={() => {
              resetAll();
              setImportMessage("All local data cleared.");
            }}
            label="Clear all saved data"
            confirmLabel="Erase everything?"
          >
            Clear all data
          </ConfirmButton>
        </div>

        {importMessage && <p className="mt-2.5 text-[12.5px] muted">{importMessage}</p>}
      </section>

      {/* ------------------------------------------------------------ about */}
      <section className="card px-4 py-4 md:px-5">
        <h2 className="text-[15px] font-semibold">About</h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed muted">
          Strata is a stock <em>screening</em> and research tool. It answers one question: which stocks currently match
          the conditions you selected, and why. It has no backtests, no buy or sell signals, no alerts, no broker
          connection and no portfolio tracking, and it makes no claim about what any stock will do next. Nothing here is
          investment advice.
        </p>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10.5px] font-semibold uppercase tracking-wider faint">{label}</dt>
      <dd className="mt-0.5 font-semibold tnum">{value}</dd>
    </div>
  );
}
