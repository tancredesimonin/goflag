import { defineConfig } from "tsup";

/**
 * Two entries, because the package has two halves and only one of them knows
 * what a framework is.
 *
 * `index` is the core of `docs/og-plan.md` D1: tokens, the degression, the ICO
 * container and the card's JSX tree. It renders nothing, so it needs neither
 * satori nor `next/og` — its only import is `react/jsx-runtime`, and that is a
 * peer. `next` is the ~30-line binding that hands the tree to `ImageResponse`.
 *
 * `platform: "node"` rather than the `neutral` `@goflag/next` uses: `writeIco`
 * reads and writes files, and hashes their inputs. The card tree itself pulls
 * none of that in — it lives in its own module and `sideEffects: false` lets a
 * bundler drop the rest.
 */
export default defineConfig({
  entry: { index: "src/index.ts", next: "src/next/index.ts" },
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  dts: true,
  clean: true,
  sourcemap: true,
  // Peers, never bundled. `next/og` is the whole reason the second entry exists;
  // bundling it would put satori inside this package, which is D1 inverted.
  external: ["react", "react/jsx-runtime", "next", "next/og"],
});
