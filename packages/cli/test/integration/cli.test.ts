/**
 * CLI end-to-end tests.
 *
 * These spawn the *real* `src/cli.ts` process (via `node --import tsx`)
 * against the demo server, so they exercise argument parsing, the audit
 * pipeline, output formatting, file writing, and — crucially — the process
 * exit codes that CI pipelines gate on. Nothing here is mocked.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GoflagReport } from "@/report/types";
import { startDemoServer, type DemoServer } from "../demo-server";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const cliPath = join(repoRoot, "src", "cli.ts");
/** Where `goflag preview` lands, given the child's cwd. `.goflag/` is ignored. */
const previewPath = join(repoRoot, ".goflag", "preview.html");

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
      // Not a temp directory: `--import tsx` resolves against the child's cwd,
      // so a child started outside the workspace cannot load the loader that
      // runs the CLI from source.
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
    rmSync(previewPath, { force: true });
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

  it("prints the rule catalogue with no URL and no network", async () => {
    const r = await runCli(["rules"]);
    expect(r.status).toBe(0);

    const catalog = JSON.parse(r.stdout);
    expect(catalog.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(catalog.rules.length).toBe(
      catalog.counts.page + catalog.counts.site + catalog.counts.prose,
    );
    const rule = catalog.rules.find((r: { id: string }) => r.id === "title.missing");
    expect(rule).toMatchObject({ scope: "page", severity: "error", rigor: "spec-required" });
    expect(catalog.sources[rule.sources[0]]).toHaveProperty("url");
  });

  it("treats `rules` after a URL as the typo it is", async () => {
    // Accepting it in any position would audit nothing while looking like it
    // worked, which is worse than an error.
    const r = await runCli([server.url, "rules"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("unexpected argument");
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

  it("emits a compact, deduped summary with --summary --json", async () => {
    const r = await runCli([
      `${server.url}/en`,
      "--summary",
      "--json",
      "--static",
      "--exclude",
      "/x/**",
    ]);
    expect(r.status).toBe(1);
    const summary = JSON.parse(r.stdout);
    expect(summary.verdict).toBe("red");
    expect(summary.totals).toBeDefined();
    // A summary rolls up — its arrays are no larger than the raw counts.
    expect(summary.seoIssues.length).toBeLessThanOrEqual(summary.totals.seoIssues);
    expect(Array.isArray(summary.brokenLinks)).toBe(true);
    // Rolled-up SEO entries carry the actionable metadata once.
    const seo = summary.seoIssues[0];
    expect(seo).toHaveProperty("ruleId");
    expect(seo).toHaveProperty("count");
  }, 30_000);

  it("renders a compact summary to stdout with --summary", async () => {
    const r = await runCli([`${server.url}/en`, "--summary", "--static", "--exclude", "/x/**"]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("(summary)");
    expect(r.stdout).toMatch(/×\d+/);
  }, 30_000);

  it("logs per-page progress to stderr in --verbose mode", async () => {
    const r = await runCli([`${server.url}/en`, "--static", "--verbose", "--exclude", "/x/**"]);
    // Progress is on stderr; the report stays on stdout.
    expect(r.stderr).toContain("Crawling pages");
    expect(r.stderr).toContain(`${server.url}/en`);
    expect(r.stdout).toContain("FLAG");
  }, 30_000);

  it("stays silent (no progress) on stderr with --quiet + --json", async () => {
    // `--no-sitemap` because the subject here is quiet mode, not discovery:
    // a single-page audit that also reported the site has no sitemap would be
    // testing two things and asserting green on neither.
    const r = await runCli([
      `${server.url}/good`,
      "--static",
      "--depth",
      "0",
      "--no-sitemap",
      "--quiet",
      "--json",
    ]);
    expect(r.status).toBe(0);
    expect(r.stderr).toBe("");
    expect(JSON.parse(r.stdout).summary.verdict).toBe("green");
  }, 30_000);

  it("renders a human report to stdout by default", async () => {
    const r = await runCli([`${server.url}/good`, "--static", "--depth", "0", "--no-sitemap"]);
    // /good alone is clean → green flag → exit 0.
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("GREEN FLAG");
    expect(r.stdout).toContain("No problems found.");
  }, 30_000);

  it("writes the JSON report to a file with --report", async () => {
    const out = join(tmp, "report.json");
    const r = await runCli([
      `${server.url}/good`,
      "--report",
      out,
      "--static",
      "--depth",
      "0",
      "--no-sitemap",
    ]);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain("report written to");

    const written = JSON.parse(readFileSync(out, "utf8")) as GoflagReport;
    expect(written.url).toContain("/good");
    expect(written.summary.verdict).toBe("green");
  }, 30_000);

  it("delivers a --json report larger than a pipe buffer without truncating it", async () => {
    // `process.exit` discards whatever is still queued, and a write to a pipe
    // is asynchronous where a write to a TTY or a file is not. So the report
    // was whole on a terminal, whole redirected to a file, and cut off at one
    // 64 KB pipe buffer — mid-token, unparseable — the moment it was piped
    // into anything: `| jq`, `| tee`, a CI step reading stdout.
    //
    // `runCli` spawns with stdout piped, which is exactly that case;
    // --conformance and --advisories are here only to push the payload past
    // the buffer, because size is what exposes this and the demo report is
    // 14 KB without them. The size assertion guards the premise: if the
    // payload ever shrinks below a buffer, this test says so rather than
    // quietly stopping to test anything.
    const r = await runCli([
      `${server.url}/en`,
      "--json",
      "--conformance",
      "--advisories",
      "--static",
      "--exclude",
      "/x/**",
    ]);
    expect(Buffer.byteLength(r.stdout)).toBeGreaterThan(64 * 1024);

    // Truncation shows up here, as a parse error on a report that ends mid-key.
    const report = JSON.parse(r.stdout) as GoflagReport;
    expect(report.conformance?.rules.length).toBeGreaterThan(0);
  }, 30_000);
  it("preview writes a standalone HTML file and prints its path", async () => {
    const r = await runCli([
      "preview",
      `${server.url}/good`,
      "--depth",
      "0",
      "--static",
      "--quiet",
    ]);
    expect(r.status).toBe(0);
    // The path alone on stdout, so `open "$(goflag preview <url>)"` works.
    expect(r.stdout.trim()).toBe(".goflag/preview.html");
    expect(r.stderr).toContain("preview written to");

    const html = readFileSync(previewPath, "utf8");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("Open Graph — the source card");
    expect(html).toContain("Goflag Demo — Good Page");
  }, 30_000);

  it("preview exits 0 on a page full of findings — looking is not gating", async () => {
    // `/bad-seo` is the fixture that fails eight rules, and a normal run exits
    // 1 on it. The whole point of this command is that it does not.
    const gated = await runCli([`${server.url}/bad-seo`, "--depth", "0", "--static", "--quiet"]);
    expect(gated.status).toBe(1);

    const r = await runCli([
      "preview",
      `${server.url}/bad-seo`,
      "--depth",
      "0",
      "--static",
      "--quiet",
    ]);
    expect(r.status).toBe(0);

    const html = readFileSync(previewPath, "utf8");
    expect(html).toContain("title.missing");
    expect(html).toContain("no <code>og:image</code>");
  }, 60_000);
});

describe("goflag CLI — --baseline", () => {
  let server: DemoServer;
  let dir: string;

  beforeAll(async () => {
    server = await startDemoServer();
    dir = mkdtempSync(join(tmpdir(), "goflag-baseline-"));
  }, 60_000);

  afterAll(async () => {
    await server.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  // Built lazily: the describe body runs before `beforeAll`, so `server` is
  // still undefined at module-evaluation time.
  const auditArgs = () => [
    `${server.url}/en`,
    "--depth",
    "2",
    "--static",
    "--quiet",
    "--exclude",
    "/x/**",
    "--exclude",
    "/en/ghost",
    "--locales",
    "en,fr,de",
  ];

  it("captures a baseline that a later run then passes against", async () => {
    // The capture path: no file yet, so there is nothing to compare against and
    // nothing to judge. It writes, says what it grandfathered, and exits 0.
    const file = join(dir, "captured.json");
    const captured = await runCli([...auditArgs(), "--baseline", file, "--update-baseline"]);
    expect(captured.status).toBe(0);
    expect(captured.stdout).toContain("baseline captured");
    expect(captured.stdout).toContain("--max-debt");

    const written = JSON.parse(readFileSync(file, "utf8")) as GoflagReport;
    expect(written.seoIssues.length).toBeGreaterThan(0);

    // And it is a real baseline, not just a file: the gate accepts it.
    const gated = await runCli([...auditArgs(), "--regressions-only", "--baseline", file]);
    expect(gated.status).toBe(0);
  }, 60_000);

  it("says what it accepted when refreshing an existing baseline", async () => {
    // Refreshing is accepting. A counter that drops without explanation reads
    // as "the problem went away", which is the failure the baseline exists to
    // prevent — so the second write has to account for itself.
    const file = join(dir, "refreshed.json");
    await runCli([...auditArgs(), "--baseline", file, "--update-baseline"]);

    const refreshed = await runCli([...auditArgs(), "--baseline", file, "--update-baseline"]);
    expect(refreshed.status).toBe(0);
    expect(refreshed.stdout).toContain("baseline updated");
    expect(refreshed.stdout).toContain("0 newly accepted");
  }, 60_000);

  it("creates the directory the baseline names", async () => {
    // The adoption path, and the one that used to fail: a repository turning
    // the gate on runs this against `.goflag/baseline.json` with no `.goflag/`
    // yet. `writeFileSync` does not create parents, so the documented first
    // step was the only command that threw — after the crawl had already run.
    const file = join(dir, "nested", "deeper", "baseline.json");
    const captured = await runCli([...auditArgs(), "--baseline", file, "--update-baseline"]);

    expect(captured.status).toBe(0);
    expect(JSON.parse(readFileSync(file, "utf8")).seoIssues.length).toBeGreaterThan(0);
  }, 60_000);

  it("creates the directory the report names", async () => {
    const file = join(dir, "reports", "goflag.json");
    const written = await runCli([...auditArgs(), "--fail-on", "never", "--report", file]);

    expect(written.status).toBe(0);
    expect(JSON.parse(readFileSync(file, "utf8")).summary).toBeDefined();
  }, 60_000);

  it("refuses --update-baseline without a file to write to", async () => {
    const orphan = await runCli([...auditArgs(), "--update-baseline"]);
    expect(orphan.status).toBe(2);
    expect(orphan.stderr).toContain("needs a --baseline");
  }, 60_000);

  it("writes --report on the run that captures the baseline", async () => {
    // The two flags are asked for together on the run that turns the gate on —
    // capture the backlog, keep the report of the run that captured it — and
    // --update-baseline returns as soon as it has written the baseline. The
    // report was never written: exit 0, "baseline captured" on stdout, and
    // nothing anywhere saying the file the caller named does not exist.
    const baseline = join(dir, "captured-with-report.json");
    const report = join(dir, "alongside.json");
    const captured = await runCli([
      ...auditArgs(),
      "--baseline",
      baseline,
      "--update-baseline",
      "--report",
      report,
    ]);

    expect(captured.status).toBe(0);
    expect(captured.stdout).toContain("baseline captured");
    expect(captured.stderr).toContain(`report written to ${report}`);
    // Both files are the same full report — that is what makes one usable as
    // the baseline the other was measured against.
    expect(readFileSync(report, "utf8")).toBe(readFileSync(baseline, "utf8"));
    expect(JSON.parse(readFileSync(report, "utf8")).summary).toBeDefined();
  }, 60_000);

  it("refuses --summary in baseline mode, before spending a crawl on it", async () => {
    // It used to parse and then be ignored, which is the failure the refusal
    // replaces: the diff is what baseline mode prints, and a rollup cannot say
    // what changed.
    const file = join(dir, "never-written.json");
    const refused = await runCli([...auditArgs(), "--regressions-only", "--baseline", file, "-s"]);

    expect(refused.status).toBe(2);
    expect(refused.stderr).toContain("--summary cannot summarise a diff");
    // Refused while parsing: no audit ran, and nothing was written.
    expect(existsSync(file)).toBe(false);
  }, 60_000);

  it("exits 0 against its own baseline, however many findings there are", async () => {
    // The whole reason the flag exists: a known backlog must not block a merge
    // that does not add to it. A plain run of this same site exits 1.
    const file = join(dir, "base.json");
    const captured = await runCli([...auditArgs(), "--report", file, "--json"]);
    expect(captured.status).toBe(1);

    const baseline = JSON.parse(readFileSync(file, "utf8")) as GoflagReport;
    expect(baseline.seoIssues.length).toBeGreaterThan(0);

    const compared = await runCli([...auditArgs(), "--regressions-only", "--baseline", file]);
    expect(compared.status).toBe(0);
    expect(compared.stdout).toContain("REGRESSION GATE");
    expect(compared.stdout).toContain("known findings NOT gating this build");
  }, 60_000);

  it("fails, and names what appeared, when findings are new", async () => {
    // A baseline captured on one page, compared against the whole site: every
    // finding outside that page reads as new.
    const file = join(dir, "narrow.json");
    await runCli([
      `${server.url}/good`,
      "--depth",
      "0",
      "--static",
      "--quiet",
      "--report",
      file,
      "--json",
    ]);

    const compared = await runCli([...auditArgs(), "--regressions-only", "--baseline", file]);
    expect(compared.status).toBe(1);
    expect(compared.stdout).toContain("New findings");
    expect(compared.stdout).toContain("REGRESSION");
  }, 60_000);

  it("reports resolved findings, not just new ones", async () => {
    // Progress is signal too: a gate that only ever shows problems stops
    // being read.
    const file = join(dir, "wide.json");
    await runCli([...auditArgs(), "--report", file, "--json"]);

    const compared = await runCli([
      `${server.url}/good`,
      "--depth",
      "0",
      "--static",
      "--quiet",
      "--regressions-only",
      "--baseline",
      file,
    ]);
    expect(compared.stdout).toContain("Resolved");
    expect(compared.status).toBe(0);
  }, 60_000);

  it("exits 2 rather than passing when the baseline file is unreadable", async () => {
    // Silently continuing would turn a typo'd path into a green build.
    const result = await runCli([
      ...auditArgs(),
      "--regressions-only",
      "--baseline",
      join(dir, "nope.json"),
    ]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("could not read baseline");
  }, 60_000);
});
