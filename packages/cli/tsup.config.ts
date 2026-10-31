import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
    index: "src/index.ts",
  },
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  // tsup injects `baseUrl` into the declaration build, which TypeScript 6
  // deprecates. The option is tsup's, not ours — silence it there rather than
  // in a tsconfig that never set it.
  dts: {
    entry: { index: "src/index.ts" },
    compilerOptions: { ignoreDeprecations: "6.0" },
  },
  clean: true,
  sourcemap: true,
  // Runtime deps are resolved from node_modules; `playwright` is loaded
  // lazily and stays external so the CLI works without it installed.
  external: ["playwright", "cheerio"],
  banner: { js: "#!/usr/bin/env node" },
});
