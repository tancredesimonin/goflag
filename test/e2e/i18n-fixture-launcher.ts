import { resolve } from "node:path";
import { startFixtureServer } from "../fixture-server";

/**
 * Boots the Phase 7 i18n-grid fixture (4 locales × 3 routes) on a
 * fixed port (default 4323) for the matrix E2E test. Mirrors the
 * shape of `fixture-launcher.ts` so Playwright treats the two
 * fixture sites identically.
 */
async function main(): Promise<void> {
  const port = Number.parseInt(process.env.HEADLINT_I18N_FIXTURE_PORT ?? "4323", 10);
  const server = await startFixtureServer({
    root: resolve(__dirname, "../../fixtures/sites/i18n-grid"),
    port,
  });

  console.log(`[i18n-fixture-server] ready at ${server.url}`);
  const stop = async () => {
    await server.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

void main().catch((err) => {
  console.error("[i18n-fixture-server] failed to start:", err);
  process.exit(1);
});
