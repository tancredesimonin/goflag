/**
 * CLI end-to-end tests.
 *
 * These spawn the *real* `src/cli.ts` process (via `node --import tsx`)
 * against the demo server, so they exercise argument parsing, the audit
 * pipeline, output formatting, file writing, and — crucially — the process
 * exit codes that CI pipelines gate on. Nothing here is mocked.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GoflagReport } from "@/report/types";
import { startDemoServer, type DemoServer } from "../demo-server";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const cliPath = join(repoRoot, "src", "cli.ts");

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

/**
 * Spawn the CLI *asynchronously*. This matters: the demo server runs in
 * this same process, so a synchronous `spawnSync` would block the event
 * loop and the child could never reach the server. Async `spawn` keeps the
 * server responsive while the child audits it.
 */
function runCli(args: string[]): Promise<RunResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, ["--import", "tsx", cliPath, ...args], {
      cwd: repoRoot,
      // NO_COLOR keeps assertions on plain text.
      env: { ...process.env, NO_COLOR: "1" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", rejectPromise);
    child.on("close", (code) => resolvePromise({ status: code ?? -1, stdout, stderr }));
  });
}

describe("goflag CLI (spawned process)", () => {
  let server: DemoServer;
  let tmp: string;

  beforeAll(async () => {
    server = await startDemoServer();
    tmp = mkdtempSync(join(tmpdir(), "goflag-cli-"));
  }, 30_000);

  afterAll(async () => {
    await server.stop();
    rmSync(tmp, { recursive: true, force: true });
  });

  it("prints help and exits 0", async () => {
    const r = await runCli(["--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("goflag <url> [options]");
  });

  it("prints a version and exits 0", async () => {
    const r = await runCli(["--version"]);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("exits 2 with help on a missing URL", async () => {
    const r = await runCli([]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("missing <url>");
  });

  it("exits 2 on an invalid URL", async () => {
    const r = await runCli(["not a url", "--json"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("goflag:");
  });

  it("exits 2 on an unknown option", async () => {
    const r = await runCli(["--frobnicate"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("unknown option");
  });

  it("audits the demo site: exits 1 (findings) and emits valid JSON", async () => {
    const r = await runCli([`${server.url}/en`, "--json", "--static", "--exclude", "/x/**"]);
    expect(r.status).toBe(1);

    const report = JSON.parse(r.stdout) as GoflagReport;
    expect(report.summary.verdict).toBe("red");
    expect(report.summary.brokenLinks).toBeGreaterThanOrEqual(1);
    expect(report.pages.length).toBeGreaterThan(1);
    // --json means stdout is *only* the JSON (nothing else on stdout).
    expect(r.stdout.trim().startsWith("{")).toBe(true);
  }, 30_000);

  it("logs per-page progress to stderr in --verbose mode", async () => {
    const r = await runCli([`${server.url}/en`, "--static", "--verbose", "--exclude", "/x/**"]);
    // Progress is on stderr; the report stays on stdout.
    expect(r.stderr).toContain("Crawling pages");
    expect(r.stderr).toContain(`${server.url}/en`);
    expect(r.stdout).toContain("FLAG");
  }, 30_000);

  it("stays silent (no progress) on stderr with --quiet + --json", async () => {
    const r = await runCli([`${server.url}/good`, "--static", "--depth", "0", "--quiet", "--json"]);
    expect(r.status).toBe(0);
    expect(r.stderr).toBe("");
    expect(JSON.parse(r.stdout).summary.verdict).toBe("green");
  }, 30_000);

  it("renders a human report to stdout by default", async () => {
    const r = await runCli([`${server.url}/good`, "--static", "--depth", "0"]);
    // /good alone is clean → green flag → exit 0.
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("GREEN FLAG");
    expect(r.stdout).toContain("No problems found.");
  }, 30_000);

  it("writes the JSON report to a file with --report", async () => {
    const out = join(tmp, "report.json");
    const r = await runCli([`${server.url}/good`, "--report", out, "--static", "--depth", "0"]);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain("report written to");

    const written = JSON.parse(readFileSync(out, "utf8")) as GoflagReport;
    expect(written.url).toContain("/good");
    expect(written.summary.verdict).toBe("green");
  }, 30_000);
});
