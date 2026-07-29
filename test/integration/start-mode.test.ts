import { afterEach, describe, expect, it } from "vitest";

import { createServer } from "node:net";

import { startServer, type StartedServer } from "@/lib/runner/dev-server";

/**
 * `--start` support, exercised against a real spawned process.
 *
 * The point of this mode is that goflag stops being a post-hoc auditor of
 * production and becomes something CI can run on a branch. That only works if
 * the lifecycle is airtight: a server that never comes up must fail loudly
 * rather than produce a site-wide outage dressed as a hundred SEO findings,
 * and the process must always be reaped or CI leaks a held port.
 *
 * A one-line `node -e` HTTP server stands in for `pnpm start`; the readiness
 * logic is framework-agnostic by design (it polls the URL, it does not parse
 * anyone's stdout).
 */

/**
 * A trivial HTTP server that answers after `delayMs`.
 *
 * Kept to a single line: the command goes through a shell (as a real
 * `--start` value would), and embedded newlines break `node -e`.
 */
function serverCommand(port: number, delayMs = 0): string {
  const script =
    `const http=require('http');` +
    `setTimeout(()=>{http.createServer((_,res)=>{res.end('ok')}).listen(${port})},${delayMs});`;
  return `node -e ${JSON.stringify(script)}`;
}

/**
 * Ask the OS for a free port, then release it. Guessing a port number makes a
 * suite that fails on whichever machine happens to be using it.
 */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string") {
        probe.close();
        reject(new Error("could not acquire a port"));
        return;
      }
      const { port } = address;
      probe.close(() => resolve(port));
    });
  });
}

describe("startServer", () => {
  let started: StartedServer | undefined;

  afterEach(async () => {
    await started?.stop();
    started = undefined;
  });

  it("resolves once the URL answers, and stops the process afterwards", async () => {
    const port = await freePort();
    const url = `http://127.0.0.1:${port}/`;

    started = await startServer({ command: serverCommand(port), url, timeoutMs: 20_000 });
    await expect(fetch(url).then((r) => r.text())).resolves.toBe("ok");

    await started.stop();
    started = undefined;
    // Once stopped, the port must be genuinely free — not held by an orphan
    // child that outlived the shell wrapper we signalled.
    await expect(fetch(url)).rejects.toThrow();
  }, 30_000);

  it("waits for a server that is slow to bind", async () => {
    const port = await freePort();
    const url = `http://127.0.0.1:${port}/`;
    started = await startServer({
      command: serverCommand(port, 700),
      url,
      timeoutMs: 20_000,
      intervalMs: 50,
    });
    await expect(fetch(url).then((r) => r.text())).resolves.toBe("ok");
  }, 30_000);

  it("fails with the command's own output when it exits before serving", async () => {
    await expect(
      startServer({
        command: "node -e \"console.error('boom: missing build'); process.exit(1)\"",
        url: `http://127.0.0.1:${await freePort()}/`,
        timeoutMs: 20_000,
      }),
    ).rejects.toThrow(/exited before .* answered.*boom: missing build/s);
  }, 30_000);

  it("times out rather than hanging when the command never listens", async () => {
    await expect(
      startServer({
        command: 'node -e "setTimeout(() => {}, 60000)"',
        url: `http://127.0.0.1:${await freePort()}/`,
        timeoutMs: 1_200,
        intervalMs: 100,
      }),
    ).rejects.toThrow(/did not serve .* within 1200ms/);
  }, 30_000);
});

describe("startServer — working directory", () => {
  it("runs the command where it is told to", async () => {
    // The monorepo case: goflag invoked from the repository root, the app a
    // few directories down.
    const port = await freePort();
    const url = `http://127.0.0.1:${port}/`;
    const started = await startServer({
      command: serverCommand(port),
      url,
      cwd: "/tmp",
      timeoutMs: 20_000,
    });
    try {
      await expect(fetch(url).then((r) => r.text())).resolves.toBe("ok");
    } finally {
      await started.stop();
    }
  }, 30_000);

  it("names the command and its directory when it exits early", async () => {
    // A command that runs fine by hand and dies here has almost always been
    // started somewhere other than where its package.json lives. Saying which
    // directory turns three failed attempts into one.
    await expect(
      startServer({
        command: "exit 1",
        cwd: "/tmp",
        url: `http://127.0.0.1:${await freePort()}/`,
        timeoutMs: 20_000,
      }),
    ).rejects.toThrow(/command: exit 1[\s\S]*in: *\/tmp/);
  }, 30_000);

  it("names them on timeout too, and points at --start-cwd", async () => {
    await expect(
      startServer({
        command: 'node -e "setTimeout(() => {}, 60000)"',
        cwd: "/tmp",
        url: `http://127.0.0.1:${await freePort()}/`,
        timeoutMs: 1_200,
        intervalMs: 100,
      }),
    ).rejects.toThrow(/--start-cwd/);
  }, 30_000);
});
