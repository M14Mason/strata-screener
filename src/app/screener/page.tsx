import { Suspense } from "react";
import ScreenerClient from "./ScreenerClient";

export const metadata = { title: "Screener — Strata" };

export default function ScreenerPage() {
  return (
    <Suspense fallback={<div className="p-6 text-[13px] muted">Loading screener…</div>}>
      <ScreenerClient />
    </Suspense>
  );
}
