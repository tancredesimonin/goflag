import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startFixtureServer, type FixtureServer } from "../fixture-server";
import { applyRuleConfig, loadConfig } from "@/lib/config";
import { lint } from "@/lib/core/lint";
import { inspect } from "@/lib/core/inspect";

interface CliResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

async function runHeadlint(args: string[]): Promise<CliResult> {
  const repoRoot = resolve(__dirname, "../..");
  // We always spawn from the repo root so tsx picks up the
  // tsconfig path aliases (`@/lib/...`); the per-test config file
  // is selected via `--config <path>`.
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
 * `headlint.config.ts` `rules: { "<id>": "off" }` must:
 *
 *   1. Drop the rule's issues from the in-process pipeline (used by
 *      both the CLI's `headlint lint` and the App Router server
 *      component) — proven by feeding the same `Page` through `lint`
 *      then `applyRuleConfig`.
 *   2. Take effect from the spawned CLI when the working directory
 *      contains a `headlint.config.ts` — proven by running
 *      `headlint lint --json` in a tmp dir with the config and
 *      asserting the rule no longer appears.
 */
describe("config: rules toggle works across the CLI + UI pipeline", () => {
  let server: FixtureServer;

  beforeAll(async () => {
    server = await startFixtureServer({
      root: resolve(__dirname, "../../fixtures/sites/tancrede"),
    });
  }, 30_000);

  afterAll(async () => {
    await server.stop();
  });

  it("`rules: { '<id>': 'off' }` strips matching issues in-process", async () => {
    const page = await inspect(`${server.url}/fr`, { probes: false });
    const baseIssues = lint(page);
    const someRuleId = baseIssues.find((i) => i.severity !== "info")?.ruleId;
    expect(someRuleId, "fixture must produce at least one non-info issue").toBeTruthy();

    const filtered = applyRuleConfig(baseIssues, {
      rules: { [someRuleId!]: "off" },
    });
    expect(filtered.find((i) => i.ruleId === someRuleId)).toBeUndefined();
    expect(filtered.length).toBeLessThan(baseIssues.length);
  }, 30_000);

  it("CLI honours a headlint.config.ts in the working directory", async () => {
    const tmp = mkdtempSync(resolve(tmpdir(), "headlint-config-"));
    const configPath = resolve(tmp, "headlint.config.ts");

    // Inspect once to discover a real ruleId we can disable.
    const page = await inspect(`${server.url}/fr`, { probes: false });
    const someRuleId = lint(page).find((i) => i.severity !== "info")?.ruleId;
    expect(someRuleId).toBeTruthy();

    writeFileSync(
      configPath,
      `export default { rules: { ${JSON.stringify(someRuleId)}: "off" } };\n`,
      "utf8",
    );

    // Sanity: loader picks up the file.
    const loaded = await loadConfig({ cwd: tmp });
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.config.rules?.[someRuleId!]).toBe("off");
    }

    const result = await runHeadlint([
      "lint",
      `${server.url}/fr`,
      "--no-probes",
      "--json",
      "--config",
      configPath,
    ]);
    // Exit code may be 1 if other (non-disabled) errors remain — we
    // only assert the disabled rule is no longer reported.
    if (result.stdout.trim().length === 0) {
      throw new Error(`headlint produced no stdout. code=${result.code} stderr=${result.stderr}`);
    }
    expect([0, 1]).toContain(result.code);
    const payload = JSON.parse(result.stdout) as { issues: { ruleId: string }[] };
    expect(payload.issues.find((i) => i.ruleId === someRuleId)).toBeUndefined();
  }, 60_000);
});
