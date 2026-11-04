import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    // An audit crawls a loopback fixture: quick, but not a unit test's 5 s.
    testTimeout: 30_000,
  },
});
