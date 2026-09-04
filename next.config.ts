import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Standalone output bundles only the server files actually reached, so the
  // container's runtime stage needs no node_modules install of its own.
  output: "standalone",

  // Pin the file-tracing root to this project. Next otherwise walks up looking
  // for a workspace boundary, and if it finds a manifest in a parent directory
  // it mirrors that entire path inside .next/standalone -- which puts server.js
  // somewhere no Dockerfile or start script expects it.
  outputFileTracingRoot: projectRoot,

  serverExternalPackages: [],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
