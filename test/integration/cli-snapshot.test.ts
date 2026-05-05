import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { startFixtureServer, type FixtureServer } from "../fixture-server";

const REPO_ROOT = resolve(__dirname, "../..");

interface CliResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

async function runHeadlint(args: string[], cwd: string): Promise<CliResult> {
  // Drive `tsx` directly: `pnpm exec` requires being inside a pnpm
  // workspace, but our temp `cwd` is intentionally outside. Forwarding
  // `TSX_TSCONFIG_PATH` keeps the `@/lib/...` path-alias resolver
  // working from outside the repo — same trick `cli-init.test.ts` uses.
  const tsxBin = resolve(REPO_ROOT, "node_modules/.bin/tsx");
  const binPath = resolve(REPO_ROOT, "src/bin/headlint.ts");
  const child = spawn(tsxBin, [binPath, ...args], {
    cwd,
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      TSX_TSCONFIG_PATH: resolve(REPO_ROOT, "tsconfig.json"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (c: string) => (stdout += c));
  child.stderr?.on("data", (c: string) => (stderr += c));
  const code = await new Promise<number | null>((res) => child.on("close", res));
  return { stdout, stderr, code };
}

const HTML_OK = `<!doctype html>
<html lang="en">
<head>
  <title>Snapshot Subject</title>
  <meta name="description" content="Snapshot integration fixture">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta property="og:title" content="Snapshot Subject">
  <meta property="og:description" content="Snapshot integration fixture">
  <meta property="og:image" content="https://example.com/og.png">
  <meta property="og:url" content="https://example.com/">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="canonical" href="https://example.com/">
</head>
<body>Hi</body>
</html>`;

const HTML_REGRESSED = HTML_OK.replace(
  '<meta property="og:image" content="https://example.com/og.png">\n  ',
  "",
);

describe("headlint snapshot (CLI E2E)", () => {
  let server: FixtureServer;
  let siteDir: string;
  let cwd: string;

  beforeAll(async () => {
    siteDir = await mkdtemp(join(tmpdir(), "headlint-snapshot-site-"));
    server = await startFixtureServer({ root: siteDir });
  }, 30_000);

  afterAll(async () => {
    await server.stop();
  });

  beforeEach(async () => {
    await writeFile(join(siteDir, "index.html"), HTML_OK, "utf8");
    cwd = await mkdtemp(join(tmpdir(), "headlint-snapshot-cwd-"));
  });

  it("--update writes a snapshot file under .headlint/snapshots/_root.json", async () => {
    const result = await runHeadlint(["snapshot", server.url, "--no-probes", "--update"], cwd);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/route: \//);
    expect(result.stdout).toContain("wrote:");
    const dir = join(cwd, ".headlint/snapshots");
    expect(await readdir(dir)).toContain("_root.json");
    const snap = JSON.parse(await readFile(join(dir, "_root.json"), "utf8")) as {
      route: string;
      schemaVersion: number;
      tags: Array<{ key: string }>;
    };
    expect(snap.schemaVersion).toBe(1);
    expect(snap.route).toBe("/");
    expect(snap.tags.some((t) => t.key === "meta:og:image[0]")).toBe(true);
  }, 30_000);

  it("default mode against an unchanged fixture reports no changes (exit 0)", async () => {
    await runHeadlint(["snapshot", server.url, "--no-probes", "--update"], cwd);
    const result = await runHeadlint(["snapshot", server.url, "--no-probes"], cwd);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("no changes since the committed snapshot.");
  }, 30_000);

  it("default mode against a regressed fixture exits 1 and lists regressions", async () => {
    await runHeadlint(["snapshot", server.url, "--no-probes", "--update"], cwd);
    await writeFile(join(siteDir, "index.html"), HTML_REGRESSED, "utf8");
    const result = await runHeadlint(["snapshot", server.url, "--no-probes"], cwd);
    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/Regressions/);
    expect(result.stdout).toContain("meta:og:image[0]");
  }, 30_000);

  it("--json emits the documented payload shape", async () => {
    await runHeadlint(["snapshot", server.url, "--no-probes", "--update"], cwd);
    await writeFile(join(siteDir, "index.html"), HTML_REGRESSED, "utf8");
    const result = await runHeadlint(["snapshot", server.url, "--no-probes", "--json"], cwd);
    expect(result.code).toBe(1);
    const payload = JSON.parse(result.stdout) as {
      schemaVersion: number;
      route: string;
      identical: boolean;
      entries: Array<{ class: string; kind: string; key: string }>;
    };
    expect(payload.schemaVersion).toBe(1);
    expect(payload.route).toBe("/");
    expect(payload.identical).toBe(false);
    expect(payload.entries.some((e) => e.class === "regression" && e.kind === "tag")).toBe(true);
  }, 30_000);

  it("default mode without a committed snapshot exits 2 with a hint", async () => {
    const result = await runHeadlint(["snapshot", server.url, "--no-probes"], cwd);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("no committed snapshot");
    expect(result.stderr).toContain("--update");
  }, 30_000);
});
