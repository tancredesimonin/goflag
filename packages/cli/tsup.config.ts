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
  dts: { entry: { index: "src/index.ts" } },
  clean: true,
  sourcemap: true,
  // Runtime deps are resolved from node_modules; `playwright` is loaded
  // lazily and stays external so the CLI works without it installed.
  external: ["playwright", "cheerio"],
  banner: { js: "#!/usr/bin/env node" },
});
