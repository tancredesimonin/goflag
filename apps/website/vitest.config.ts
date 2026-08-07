import path from "node:path";

import { defineConfig } from "vitest/config";

/**
 * Unit tests for the metadata layer.
 *
 * `src/lib/seo/routes.ts` and `metadata.ts` import no generated content and no
 * Next runtime, which is the whole point of the split: they run here in
 * milliseconds, with no `content-collections build` and no `next build` in
 * front of them. `site-routes.ts` is the file that touches both, and the build
 * is what covers it.
 *
 * The `@/` alias is spelled out rather than read from `tsconfig.json` by a
 * plugin. One alias is not worth a dependency, and the plugin that does it is
 * ESM-only while this package is CommonJS — a mismatch that fails at config
 * load, before a single test runs.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Same alias `tsconfig.json` declares. `content.test.ts` is the one test
      // that needs it, and it needs it precisely because the generated
      // collection is what silently loses a document.
      "content-collections": path.resolve(__dirname, ".content-collections/generated"),
    },
  },
  // An inline (empty) PostCSS config stops Vite from discovering the site's
  // own. That file is Tailwind 4's, which Vite 5 cannot load — and nothing
  // under test here renders a stylesheet, so the right answer is not to build
  // CSS at all rather than to make the site's pipeline work twice.
  css: { postcss: { plugins: [] } },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
