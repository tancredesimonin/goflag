import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { loadConfig } from "@/lib/config";

interface CliResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

async function runHeadlint(args: string[], cwd?: string): Promise<CliResult> {
  const repoRoot = resolve(__dirname, "../..");
  const tsxBin = resolve(repoRoot, "node_modules/.bin/tsx");
  const binPath = resolve(repoRoot, "src/bin/headlint.ts");
  // Forwarding `TSX_TSCONFIG_PATH` is the only way to keep tsx's
  // path-alias resolution working when the child is launched from
  // a tmp dir outside the repo. Without it, `import "@/lib/..."`
  // fails as a "module not found" the moment program.ts loads.
  const child = spawn(tsxBin, [binPath, ...args], {
    cwd: cwd ?? repoRoot,
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      TSX_TSCONFIG_PATH: resolve(repoRoot, "tsconfig.json"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (c: string) => (stdout += c));
  child.stderr?.on("data", (c: string) => (stderr += c));
  const code: number | null = await new Promise((r) => child.on("close", (c) => r(c)));
  return { stdout, stderr, code };
}

/**
 * `headlint init --yes` produces a `headlint.config.ts` in the
 * working directory. The generated file must round-trip through
 * `loadConfig()`: parsed values match what the scaffolder wrote and
 * defaults are applied as expected.
 *
 * We can't drive `tsx` from outside the repo (the path-alias
 * resolver lives in our tsconfig), so the test runs `headlint init`
 * with `cwd: tmp` from the repo's pnpm + tsx, which works because
 * `init` itself does no `@/` imports at runtime aside from the
 * config helpers that live alongside it.
 */
describe("headlint init (CLI E2E)", () => {
  it("writes a parseable headlint.config.ts the loader can read back", async () => {
    const tmp = mkdtempSync(resolve(tmpdir(), "headlint-init-"));

    const result = await runHeadlint(
      ["init", "--yes", "--base-url", "https://round-trip.example"],
      tmp,
    );
    expect(result.code, `stderr: ${result.stderr}`).toBe(0);

    const generated = resolve(tmp, "headlint.config.ts");
    expect(existsSync(generated)).toBe(true);
    const source = readFileSync(generated, "utf8");
    expect(source).toContain("https://round-trip.example");
    expect(source).toContain("export default");

    const loaded = await loadConfig({ file: generated });
    expect(loaded.ok, !loaded.ok ? loaded.errors.join("\n") : "").toBe(true);
    if (loaded.ok) {
      expect(loaded.config.baseUrl).toBe("https://round-trip.example");
      // Crawl defaults applied even though the template wrote
      // `enabled: false` only.
      expect(loaded.config.crawl?.depth).toBe(1);
      expect(loaded.config.crawl?.concurrency).toBe(4);
    }
  }, 60_000);

  it("refuses to overwrite an existing config without --force", async () => {
    const tmp = mkdtempSync(resolve(tmpdir(), "headlint-init-"));
    await runHeadlint(["init", "--yes"], tmp);
    const second = await runHeadlint(["init", "--yes"], tmp);
    expect(second.code).toBe(2);
    expect(second.stderr).toContain("already exists");
  }, 60_000);
});
