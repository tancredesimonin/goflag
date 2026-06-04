import { startAuditFixtureServer } from "../audit-fixture-server";

/**
 * Boots the programmable audit fixture (pages with broken/redirect/soft-404
 * links + a sitemap listing a dead URL) on a fixed port for the suite E2E
 * test and for manual UI testing. External links point at a second
 * instance of the same server so the link audit stays hermetic (no real
 * internet).
 */
async function main(): Promise<void> {
  const port = Number.parseInt(process.env.GOFLAG_AUDIT_FIXTURE_PORT ?? "4324", 10);
  const externalPort = port + 1;

  const external = await startAuditFixtureServer({ port: externalPort });
  const site = await startAuditFixtureServer({ port, externalOrigin: external.url });

  console.log(`[audit-fixture-server] ready at ${site.url} (external at ${external.url})`);

  const stop = async () => {
    await site.stop();
    await external.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

void main().catch((err) => {
  console.error("[audit-fixture-server] failed to start:", err);
  process.exit(1);
});
