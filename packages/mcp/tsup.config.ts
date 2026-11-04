import { defineConfig } from "tsup";

/**
 * Two entries. `cli` is the `goflag-mcp` binary an MCP client spawns over
 * stdio; `index` exports `createGoflagServer` for a host that brings its own
 * transport. Dependencies stay external — tsup leaves what `package.json`
 * declares out of the bundle — so `@goflag/cli` resolves to the version npm
 * installed beside this one, not a copy frozen into it.
 */
export default defineConfig({
  entry: { cli: "src/cli.ts", index: "src/index.ts" },
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  dts: {
    entry: { index: "src/index.ts" },
    compilerOptions: { ignoreDeprecations: "6.0" },
  },
  clean: true,
  sourcemap: true,
  banner: { js: "#!/usr/bin/env node" },
});
