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
  // setEncoding routes chunks through StringDecoder, which preserves
  // multi-byte UTF-8 sequences split across chunk boundaries. With the
  // post-Phase-2 Page now embedding the full static HTML, payloads cross
  // the 64 KiB pipe-buffer threshold and naive `chunk.toString()` would
  // occasionally truncate accented characters mid-byte.
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => (stdout += chunk));
  child.stderr?.on("data", (chunk: string) => (stderr += chunk));

  const code: number | null = await new Promise((resolveClose) => {
    child.on("close", (c) => resolveClose(c));
  });

  return { stdout, stderr, code };
}

describe("headlint inspect (CLI E2E)", () => {
  let server: FixtureServer;

  beforeAll(async () => {
    server = await startFixtureServer({
      root: resolve(__dirname, "../../fixtures/sites/tancrede"),
    });
  }, 30_000);

  afterAll(async () => {
    await server.stop();
  });

  it("--json outputs a parseable Page object and exits 0", async () => {
    const result = await runHeadlint(["inspect", `${server.url}/fr`, "--json", "--no-probes"]);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    const payload = JSON.parse(result.stdout) as {
      schemaVersion: number;
      meta: { title?: { value: string } };
    };
    expect(payload.schemaVersion).toBe(2);
    expect(payload.meta.title?.value).toContain("Tancrède Simonin");
  }, 30_000);

  it("default human-readable output contains a summary header and exits 0", async () => {
    const result = await runHeadlint(["inspect", `${server.url}/fr`, "--no-probes"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Headlint inspect");
    expect(result.stdout).toContain("Open Graph");
    expect(result.stdout).toContain("Twitter / X");
    expect(result.stdout).toContain("hreflang");
  }, 30_000);

  it("exits non-zero with a friendly error for an unreachable URL", async () => {
    // Bind to a port we know is closed (port 1 is reserved + privileged).
    const result = await runHeadlint([
      "inspect",
      "http://127.0.0.1:1/",
      "--no-probes",
      "--timeout",
      "1500",
    ]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/headlint:.*(Network error|timed out|ECONNREFUSED|fetch)/i);
  }, 15_000);

  it("exits non-zero with a friendly error for an invalid URL", async () => {
    const result = await runHeadlint(["inspect", "not-a-url", "--no-probes"]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/headlint:.*Invalid URL/);
  }, 15_000);
});
