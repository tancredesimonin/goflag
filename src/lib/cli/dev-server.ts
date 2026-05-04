import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Helpers behind `headlint dev <url>`. Kept in a separate module so the
 * CLI command stays a thin orchestrator and we can unit-test the
 * port-finding and ready-detection logic without spawning Next.
 */

/**
 * Ask the kernel for a free TCP port (binds to 0, reads what was assigned,
 * then releases it). Subject to the usual race window — if another process
 * grabs the same port between the close and Next's listen, the user will
 * see Next print "address already in use" and we'll abort gracefully.
 */
export async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("Could not allocate a free port")));
      }
    });
  });
}

/**
 * Walks the package.json directory tree from `start` upward until it finds
 * one that contains the named binary in node_modules/.bin. Returns the
 * absolute path to that bin, or undefined if not found.
 *
 * Used so `headlint dev` works whether the user runs it from the headlint
 * repo (the binary is in our local node_modules) or as a globally-installed
 * package (where pnpm/npm puts it in the parent project's node_modules).
 */
export function findLocalBin(name: string, start: string): string | undefined {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    const candidate = path.join(dir, "node_modules", ".bin", name);
    try {
      // Require to fail loudly if the lookup is on the wrong host — but we
      // only need existence, so a dynamic require is too heavy. fs.existsSync
      // is fine; the import lives in callers, not here, to keep this module
      // pure for unit tests.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require("node:fs") as typeof import("node:fs");
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // Walking continues regardless.
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

export interface DevServerHandle {
  child: ChildProcess;
  url: string;
  port: number;
}

export interface SpawnDevServerOptions {
  port: number;
  /** Project root passed to `next dev`. Defaults to the headlint package root. */
  projectRoot?: string;
  /** Inherit stdio of the spawned process. Defaults to true. */
  inheritStdio?: boolean;
  /** Override the binary path (for tests). */
  nextBin?: string;
}

/**
 * Spawn `next dev` on the chosen port. Resolves once Next prints its
 * "Ready" banner; rejects if the child exits before then.
 */
export async function spawnNextDev(opts: SpawnDevServerOptions): Promise<DevServerHandle> {
  const projectRoot = opts.projectRoot ?? defaultProjectRoot();
  const nextBin = opts.nextBin ?? findLocalBin("next", projectRoot);
  if (!nextBin) {
    throw new Error(
      `Could not find the 'next' binary near ${projectRoot}. Install Next.js or run from the headlint repo.`,
    );
  }
  const child = spawn(nextBin, ["dev", "--port", String(opts.port), "--hostname", "127.0.0.1"], {
    cwd: projectRoot,
    stdio: opts.inheritStdio === false ? ["ignore", "pipe", "pipe"] : "inherit",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });

  await waitForReady(child);
  return {
    child,
    port: opts.port,
    url: `http://127.0.0.1:${opts.port}`,
  };
}

/**
 * Resolves once the Next dev server is ready. Looks for either Next's
 * "Ready" banner on stdout or a successful HEAD on /. Rejects if the
 * child exits early.
 *
 * Exposed for unit tests: pass any object with stdout/stderr Readables and
 * an `on('exit')` to drive the matcher without spawning Next.
 */
export function waitForReady(
  child: {
    stdout?: NodeJS.ReadableStream | null;
    stderr?: NodeJS.ReadableStream | null;
    on: (ev: string, cb: (...args: unknown[]) => void) => unknown;
  },
  timeoutMs = 60_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve();
    };

    const matchReady = (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      if (/ready in|Ready in|started server/i.test(text)) finish();
    };

    if (child.stdout) child.stdout.on("data", matchReady);
    if (child.stderr) child.stderr.on("data", matchReady);
    child.on("exit", (code) => {
      finish(new Error(`next dev exited before ready (code ${String(code)})`));
    });

    const timer = setTimeout(() => {
      finish(new Error(`Timed out after ${timeoutMs}ms waiting for next dev to be ready`));
    }, timeoutMs);
  });
}

function defaultProjectRoot(): string {
  // Walk up from this file until we find the package.json that owns Next's
  // app/ directory. Works for both `tsx src/bin/headlint.ts` (where
  // __dirname is src/lib/cli) and the compiled bin (dist/lib/cli) without
  // hard-coding a specific depth.
  const here =
    typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));
  let dir = here;
  for (let i = 0; i < 12; i++) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return here;
}
