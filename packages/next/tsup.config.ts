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
  // tsup injects `baseUrl` into the declaration build, which TypeScript 6
  // deprecates. The option is tsup's, not ours — silence it there rather than
  // in a tsconfig that never set it.
  dts: { compilerOptions: { ignoreDeprecations: "6.0" } },
  clean: true,
  sourcemap: true,
});
