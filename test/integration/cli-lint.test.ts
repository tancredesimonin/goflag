import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFixtureServer, type FixtureServer } from "../fixture-server";

interface CliResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

/**
 * `headlint lint` end-to-end: spawn the real CLI binary against a Hono
 * fixture server, assert exit codes and `--json` shape. The in-process
 * tests in `src/lib/cli/program.test.ts` cover the same flags but via
 * `runCli()` directly, which is faster and skips the child-process
 * boundary; this file is the boundary check that catches regressions
 * in `src/bin/headlint.ts` (stdio flushing, exit-code propagation,
 * shebang, etc.).
 */
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

describe("headlint lint (CLI E2E)", () => {
  let server: FixtureServer;

  beforeAll(async () => {
    server = await startFixtureServer({
      root: resolve(__dirname, "../../fixtures/sites/tancrede"),
    });
  }, 30_000);

  afterAll(async () => {
    await server.stop();
  });

  it("default output prints the human-readable report header", async () => {
    const result = await runHeadlint(["lint", `${server.url}/fr`, "--no-probes"]);
    expect(result.stdout).toContain("Headlint lint");
    // Tancrede page is well-curated; either zero issues or a small
    // number, never a stack trace. Just assert the report shape.
    expect(result.stdout).toMatch(/issue\(s\)|No issues/);
  }, 30_000);

  it("--json emits the documented payload shape", async () => {
    const result = await runHeadlint(["lint", `${server.url}/fr`, "--no-probes", "--json"]);
    expect(result.stderr).toBe("");
    const payload = JSON.parse(result.stdout) as {
      schemaVersion: number;
      url: string;
      finalUrl: string;
      fetchedAt: string;
      counts: { error: number; warning: number; info: number };
      issues: Array<{ ruleId: string; severity: string; message: string; docs?: string }>;
    };
    expect(payload.schemaVersion).toBe(1);
    expect(payload.url).toContain("/fr");
    expect(payload.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof payload.counts.error).toBe("number");
    expect(typeof payload.counts.warning).toBe("number");
    expect(typeof payload.counts.info).toBe("number");
    expect(Array.isArray(payload.issues)).toBe(true);
    for (const issue of payload.issues) {
      expect(typeof issue.ruleId).toBe("string");
      expect(["error", "warning", "info"]).toContain(issue.severity);
      expect(typeof issue.message).toBe("string");
      expect(issue.message.length).toBeGreaterThan(0);
      expect(issue.docs).toMatch(/^\/rules\//);
    }
    // Exit code mirrors the error count: 1 if any errors, 0 otherwise.
    if (payload.counts.error > 0) {
      expect(result.code).toBe(1);
    } else {
      expect(result.code).toBe(0);
    }
  }, 30_000);

  it("exits 1 when --max-warnings is exceeded (with the budget message on stderr)", async () => {
    const result = await runHeadlint([
      "lint",
      `${server.url}/fr`,
      "--no-probes",
      "--max-warnings",
      "0",
    ]);
    if (result.stdout.includes("[warn ]")) {
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("--max-warnings=0");
    } else {
      expect(result.stderr).not.toContain("--max-warnings");
    }
  }, 30_000);

  it("exits non-zero with a friendly error for an unreachable URL", async () => {
    const result = await runHeadlint([
      "lint",
      "http://127.0.0.1:1/",
      "--no-probes",
      "--timeout",
      "1500",
    ]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/headlint:.*(Network error|timed out|ECONNREFUSED|fetch)/i);
  }, 15_000);
});
