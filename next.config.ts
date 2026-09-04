import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: [],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
