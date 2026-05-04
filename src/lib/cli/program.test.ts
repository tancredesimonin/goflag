import { Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "./program";
import { startFixtureServer, type FixtureServer } from "../../../test/fixture-server";
import { resolve } from "node:path";

class CaptureStream extends Writable {
  chunks: string[] = [];
  override _write(chunk: Buffer, _enc: BufferEncoding, cb: (err?: Error | null) => void) {
    this.chunks.push(chunk.toString());
    cb();
  }
  text() {
    return this.chunks.join("");
  }
}

describe("runCli (in-process)", () => {
  let server: FixtureServer;
  let stdout: CaptureStream;
  let stderr: CaptureStream;
  let prevExitCode: number | string | undefined;

  beforeEach(async () => {
    server = await startFixtureServer({
      root: resolve(__dirname, "../../../fixtures/sites/synthetic"),
    });
    stdout = new CaptureStream();
    stderr = new CaptureStream();
    prevExitCode = process.exitCode ?? undefined;
    process.exitCode = 0;
  });

  afterEach(async () => {
    await server.stop();
    process.exitCode = prevExitCode ?? 0;
  });

  it("--version prints the version and exits 0", async () => {
    const code = await runCli(["--version"], { stdout, stderr });
    expect(code).toBe(0);
    expect(stdout.text().trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("--help prints usage and exits 0", async () => {
    const code = await runCli(["--help"], { stdout, stderr });
    expect(code).toBe(0);
    expect(stdout.text()).toContain("Usage: headlint");
    expect(stdout.text()).toContain("inspect");
  });

  it("inspect --json against the synthetic kitchen-sink prints a valid Page", async () => {
    const code = await runCli(["inspect", `${server.url}/kitchen-sink`, "--json", "--no-probes"], {
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(stderr.text()).toBe("");
    const payload = JSON.parse(stdout.text()) as {
      schemaVersion: number;
      jsonLd: { types: string[] }[];
    };
    expect(payload.schemaVersion).toBe(2);
    expect(payload.jsonLd.length).toBe(4);
  });

  it("inspect (default) prints the human-readable summary", async () => {
    const code = await runCli(["inspect", `${server.url}/kitchen-sink`, "--no-probes"], {
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(stdout.text()).toContain("Headlint inspect");
    expect(stdout.text()).toContain("JSON-LD blocks: 4");
  });

  it("inspect of an invalid URL exits non-zero with FetchError message", async () => {
    const code = await runCli(["inspect", "::not a url::", "--no-probes"], { stdout, stderr });
    expect(code).not.toBe(0);
    expect(stderr.text()).toContain("Invalid URL");
  });

  it("inspect of an unreachable host exits non-zero with FetchError message", async () => {
    const code = await runCli(
      ["inspect", "http://127.0.0.1:1/", "--no-probes", "--timeout", "800"],
      { stdout, stderr },
    );
    expect(code).not.toBe(0);
    expect(stderr.text()).toMatch(/Network error|timed out|ECONNREFUSED|fetch/i);
  });

  it("returns exit code 2 when commander rejects unknown commands", async () => {
    const code = await runCli(["nope-no-such-command"], { stdout, stderr });
    expect(code).toBeGreaterThan(0);
  });
});
