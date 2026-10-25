import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  outputFileTracingRoot: process.cwd(),
  images: { unoptimized: true },
  reactStrictMode: true,
  devIndicators: false,
};

export default nextConfig;
