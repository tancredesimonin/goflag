import path from "node:path";

import { defineConfig } from "vitest/config";

/**
 * The site's unit tests: what a page says, checked against what it is drawn
 * from — the catalogues, transcripts, changelogs and source under `packages/`,
 * and the documents content-collections builds — plus the share images and the
 * hero diagram's server render.
 *
 * None of it needs `next build`. Two builds do run first, from the `test` script:
 * `content-collections build`, for the collection `content.test.ts` reads, and
 * `@goflag/og`'s, whose output the share-image code imports.
 *
 * The aliases are spelled out rather than read from `tsconfig.json` by a plugin.
 * Two aliases are not worth a dependency, and the plugin that does it is
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
    // `.tsx` for a test that renders a component. Without JSX a provider's child
    // has nowhere to go: `tsc` wants it among the props, and `react/no-children-prop`
    // forbids it there.
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
