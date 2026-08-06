import { defineConfig } from "tsup";

/**
 * The runtime has no dependencies to bundle or externalise — invariant I1. The
 * only import is `next`'s `Metadata` / `MetadataRoute` types, which are erased.
 */
export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  platform: "neutral",
  target: "node22",
  outDir: "dist",
  dts: true,
  clean: true,
  sourcemap: true,
});
