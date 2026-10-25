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
 * `.mts`, because this package is CommonJS — it has no `"type": "module"`, Next
 * wants none — and a `.ts` config full of `import` statements is loaded as an ES
 * module only by courtesy of Vite's bundling loader, which warns that its native
 * loader will not. The extension says what the file is.
 *
 * The aliases are spelled out rather than read from `tsconfig.json` by a plugin.
 * Two aliases are not worth a dependency.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // Same alias `tsconfig.json` declares. `content.test.ts` is the one test
      // that needs it, and it needs it precisely because the generated
      // collection is what silently loses a document.
      "content-collections": path.resolve(import.meta.dirname, ".content-collections/generated"),
    },
  },
  test: {
    // `.tsx` for a test that renders a component. Without JSX a provider's child
    // has nowhere to go: `tsc` wants it among the props, and `react/no-children-prop`
    // forbids it there.
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
