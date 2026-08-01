import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    // The integration suite boots real HTTP servers, spawns the CLI as a child
    // process, and launches Chromium. Under vitest's default 5s those tests
    // pass alone and fail in a full local run — a different subset each time,
    // which reads as a regression and is only contention. CI splits `test:unit`
    // from `test:integration` so it never saw it; a suite that is flaky on the
    // author's machine is worse, because that is where it gets ignored.
    // Timeouts only bite on failure, so raising them costs nothing when green.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    include: [
      "src/**/*.{test,spec}.ts",
      "test/unit/**/*.{test,spec}.ts",
      "test/integration/**/*.{test,spec}.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "cobertura"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.{test,spec}.ts", "src/**/*.d.ts", "src/cli.ts"],
      thresholds: {
        "src/lib/core/**": { lines: 85, branches: 85, functions: 85, statements: 85 },
        "src/lib/rules/**": { lines: 85, branches: 80, functions: 85, statements: 85 },
      },
    },
  },
});
