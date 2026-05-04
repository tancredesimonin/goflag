import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    setupFiles: ["./test/setup.ts"],
    environment: "node",
    environmentMatchGlobs: [
      ["src/components/**", "jsdom"],
      ["src/lib/previews/**", "jsdom"],
      ["test/component/**", "jsdom"],
    ],
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "test/unit/**/*.{test,spec}.{ts,tsx}",
      "test/component/**/*.{test,spec}.{ts,tsx}",
      "test/integration/**/*.{test,spec}.{ts,tsx}",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "cobertura"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.{test,spec}.{ts,tsx}",
        "src/**/__tests__/**",
        "src/app/**/layout.tsx",
        "src/app/**/page.tsx",
        "src/**/*.d.ts",
        // Vendor / third-party code: shadcn primitives + shadcn studio blocks
        // are not authored here and are excluded from our coverage gate.
        "src/components/ui/**",
        "src/components/shadcn-studio/**",
        "src/hooks/**",
        "src/lib/utils.ts",
        // Bin entrypoint is a 6-line shim covered by spawned CLI E2E tests
        // (which v8 in-process coverage cannot observe).
        "src/bin/**",
      ],
      thresholds: {
        "src/lib/core/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
        "src/lib/rules/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
        "src/lib/snapshots/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
        "src/lib/suggestions/**": { lines: 90, branches: 90, functions: 90, statements: 90 },
        "src/components/**": { lines: 70, branches: 70, functions: 70, statements: 70 },
      },
    },
  },
});
