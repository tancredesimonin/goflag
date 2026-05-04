import { resolve } from "node:path";
import { startFixtureServer } from "../fixture-server";

/**
 * Standalone entry point used by Playwright's `webServer` config to boot the
 * tancrede fixture server on a fixed port (4321). Running it through `tsx`
 * sidesteps the Playwright loader's CommonJS/ESM mismatch — `tsx` compiles
 * the whole import graph the same way and runs it in its own Node process,
 * decoupled from Playwright's transformer.
 */
async function main(): Promise<void> {
  const port = Number.parseInt(process.env.HEADLINT_FIXTURE_PORT ?? "4321", 10);
  const server = await startFixtureServer({
    root: resolve(__dirname, "../../fixtures/sites/tancrede"),
    port,
  });
  // Print so anyone tailing logs can see the bound URL.
   
  console.log(`[fixture-server] ready at ${server.url}`);
  // Keep the process alive — Playwright stops it via SIGTERM.
  const stop = async () => {
    await server.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

void main().catch((err) => {
   
  console.error("[fixture-server] failed to start:", err);
  process.exit(1);
});
