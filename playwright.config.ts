import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "pnpm build && pnpm start",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Hard-coded port keeps `inspect.spec.ts` parameterless. 4322 to
      // avoid collision with `test/manual/serve-spa.ts` which defaults to
      // 4321.
      command: "pnpm exec tsx test/e2e/fixture-launcher.ts",
      env: { HEADLINT_FIXTURE_PORT: "4322" },
      url: "http://127.0.0.1:4322/_health",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      // Phase 7 fixture: 4 locales × 3 routes, used by the i18n
      // matrix E2E test. Distinct port from the tancrede fixture so
      // both can run concurrently under one Playwright invocation.
      command: "pnpm exec tsx test/e2e/i18n-fixture-launcher.ts",
      env: { HEADLINT_I18N_FIXTURE_PORT: "4323" },
      url: "http://127.0.0.1:4323/_health",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
