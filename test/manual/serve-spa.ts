import { resolve } from "node:path";
import { startFixtureServer } from "../fixture-server";

async function main() {
  const port = Number.parseInt(process.argv[2] ?? "4321", 10);
  const server = await startFixtureServer({
    root: resolve(__dirname, "../../fixtures/sites/spa"),
    port,
  });
  console.log(`SPA fixture server listening on ${server.url}`);
  process.on("SIGINT", () => void server.stop().then(() => process.exit(0)));
  process.on("SIGTERM", () => void server.stop().then(() => process.exit(0)));
}

void main();
