import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { StoreProvider } from "@/lib/client/store";

export const metadata: Metadata = {
  title: {
    default: "Strata — Stock Screener & Strategy Builder",
    template: "%s",
  },
  description:
    "Scan the U.S. stock market with technical and fundamental filters, build custom screening strategies without code, and see exactly why each stock matches. A research tool, not investment advice.",
  applicationName: "Strata",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-icon.svg" }],
  },
  openGraph: {
    title: "Strata — Stock Screener & Strategy Builder",
    description:
      "Scan thousands of U.S. stocks with technical filters, build screening strategies without code, and see exactly why each stock matches.",
    type: "website",
  },
  // The app has nothing to gain from being indexed and the pages are
  // per-user state, so keep crawlers out by default.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#090b0f" },
    { media: "(prefers-color-scheme: light)", color: "#f5f7fa" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/*
          Applies the stored theme before first paint so a light-mode user never
          sees a dark flash. Reads one key and sets one attribute.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var s=JSON.parse(localStorage.getItem("strata.v1")||"{}");var t=s&&s.settings&&s.settings.theme;if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t}}catch(e){}`,
          }}
        />
      </head>
      <body>
        <StoreProvider>
          <AppShell>{children}</AppShell>
        </StoreProvider>
      </body>
    </html>
  );
}
