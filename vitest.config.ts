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
