import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startFixtureServer, type FixtureServer } from "../fixture-server";

interface CliResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

async function runHeadlint(args: string[]): Promise<CliResult> {
  const repoRoot = resolve(__dirname, "../..");
  const child = spawn("pnpm", ["--silent", "exec", "tsx", "src/bin/headlint.ts", ...args], {
    cwd: repoRoot,
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => (stdout += chunk));
  child.stderr?.on("data", (chunk: string) => (stderr += chunk));
  const code: number | null = await new Promise((resolveClose) => {
    child.on("close", (c) => resolveClose(c));
  });
  return { stdout, stderr, code };
}

/**
 * Phase 7 CLI E2E: spawns the real `headlint inspect --crawl …`
 * subprocess against the i18n-grid fixture and asserts the visited
 * URL set + matrix shape from the JSON output.
 */
describe("headlint inspect --crawl (CLI E2E)", () => {
  let server: FixtureServer;

  beforeAll(async () => {
    server = await startFixtureServer({
      root: resolve(__dirname, "../../fixtures/sites/i18n-grid"),
    });
  }, 30_000);

  afterAll(async () => {
    await server.stop();
  });

  it("--crawl --depth 2 walks every (locale × route) page", async () => {
    const result = await runHeadlint([
      "inspect",
      `${server.url}/en`,
      "--crawl",
      "--depth",
      "2",
      "--no-probes",
      "--json",
    ]);
    expect(result.code).toBe(0);
    const payload = JSON.parse(result.stdout) as {
      visited: string[];
      pages: { fetch: { finalUrl: string } }[];
      matrix: { routes: string[]; locales: string[] };
    };
    expect(payload.matrix.routes.sort()).toEqual(["/", "/blog", "/blog/post"]);
    expect(payload.matrix.locales).toContain("x-default");
    expect(payload.matrix.locales).toContain("fr");
    const paths = new Set(payload.pages.map((p) => new URL(p.fetch.finalUrl).pathname));
    for (const expected of ["/en/blog", "/fr/blog/post", "/de", "/es/blog"]) {
      expect(paths.has(expected), `missing ${expected}`).toBe(true);
    }
  }, 60_000);

  it("--include filters down to /blog/post variants only", async () => {
    const result = await runHeadlint([
      "inspect",
      `${server.url}/en`,
      "--depth",
      "2",
      "--include",
      "**/blog/post",
      "--no-probes",
      "--json",
    ]);
    expect(result.code).toBe(0);
    const payload = JSON.parse(result.stdout) as {
      pages: { fetch: { finalUrl: string } }[];
    };
    const paths = payload.pages.map((p) => new URL(p.fetch.finalUrl).pathname);
    // The entry page (/en) and the four post variants are allowed —
    // intermediate /<locale>/blog index pages should be filtered out
    // unless they're hreflang-promoted (which they aren't, since
    // /en links to /en/blog only via a body anchor).
    for (const path of paths) {
      const isPost = /\/(en|fr|de|es)\/blog\/post$/.test(path);
      const isLocaleHome = /^\/(en|fr|de|es)$/.test(path);
      expect(isPost || isLocaleHome, `unexpected ${path}`).toBe(true);
    }
  }, 60_000);
});
