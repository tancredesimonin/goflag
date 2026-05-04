import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // tsx + esbuild are runtime-only deps used by the Phase 8 config
  // loader (`src/lib/config/load.ts`). Webpack can't bundle either,
  // so we mark them external — Next leaves the requires intact and
  // resolves them at runtime in the Node server context.
  serverExternalPackages: ["tsx", "esbuild"],
};

export default nextConfig;
