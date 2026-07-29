/**
 * Boot-and-audit support for `--start`.
 *
 * goflag was only ever able to audit a deployed site. That makes it a post-hoc
 * auditor, and post-hoc auditors do not get run: by the time a finding appears,
 * the regression already shipped. `--start` closes that gap — boot the app,
 * wait until it answers, audit `localhost`, tear it down — so the same checks
 * can gate a merge instead of documenting a mistake.
 *
 * Deliberately dumb about readiness: rather than parsing a framework's stdout
 * for "ready in 1.2s" (every framework words it differently, and the wording
 * changes between minor versions), it polls the URL goflag is about to audit.
 * If that URL answers, the audit can proceed — which is the only definition of
 * "ready" that actually matters here.
 */

import { spawn, type ChildProcess } from "node:child_process";

export interface StartedServer {
  /** Terminate the process group and resolve once it is gone. */
  stop: () => Promise<void>;
}

export interface StartServerOptions {
  /** Shell command to run, e.g. `pnpm start`. */
  command: string;
  /** URL polled until it answers; normally the audit entry point. */
  url: string;
  /** Give up after this long. Defaults to 60s. */
  timeoutMs?: number;
  /** Poll interval. Defaults to 250ms. */
  intervalMs?: number;
  /** Called with each stdout/stderr chunk, for `--verbose`. */
  onOutput?: (chunk: string) => void;
  /** Accept self-signed TLS while polling (a local https dev server). */
  allowInsecureTls?: boolean;
}

/** True once the URL returns any HTTP response at all. */
async function answers(url: string, allowInsecureTls: boolean): Promise<boolean> {
  const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  if (allowInsecureTls) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  try {
    // Any status counts: a 404 on the entry path still proves the server is
    // up, and the audit itself is what judges the response.
    await fetch(url, { redirect: "manual" });
    return true;
  } catch {
    return false;
  } finally {
    if (allowInsecureTls) {
      if (previous === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
    }
  }
}

function terminate(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }

    // Kill the whole group: `pnpm start` spawns the real server as a child,
    // and signalling only the wrapper orphans a process holding the port.
    const killGroup = (signal: NodeJS.Signals) => {
      try {
        if (child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch {
        // Already dead, or the group is gone — nothing left to do.
      }
    };

    const force = setTimeout(() => killGroup("SIGKILL"), 5_000);
    child.once("exit", () => {
      clearTimeout(force);
      resolve();
    });
    killGroup("SIGTERM");
  });
}

/**
 * Spawn `command` and resolve once `url` answers.
 *
 * Rejects — after stopping the process — when the command exits early or the
 * timeout expires. Both are hard failures: auditing a server that never came
 * up would report a site-wide outage as a hundred SEO findings.
 */
export async function startServer(options: StartServerOptions): Promise<StartedServer> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const intervalMs = options.intervalMs ?? 250;
  const allowInsecureTls = options.allowInsecureTls === true;

  const child = spawn(options.command, {
    shell: true,
    // Own process group, so `terminate` can take the whole tree down.
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let exited: { code: number | null; signal: NodeJS.Signals | null } | undefined;
  child.once("exit", (code, signal) => {
    exited = { code, signal };
  });

  const tail: string[] = [];
  const record = (chunk: Buffer) => {
    const text = chunk.toString();
    options.onOutput?.(text);
    // Keep a short tail so a boot failure can be reported with its own words
    // instead of a bare "command exited".
    tail.push(text);
    if (tail.length > 40) tail.shift();
  };
  child.stdout?.on("data", record);
  child.stderr?.on("data", record);

  const server: StartedServer = { stop: () => terminate(child) };
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    if (exited) {
      await server.stop();
      const why = exited.signal ? `signal ${exited.signal}` : `exit code ${exited.code}`;
      throw new Error(
        `--start command exited before ${options.url} answered (${why}).\n${tail.join("").trimEnd()}`,
      );
    }
    if (await answers(options.url, allowInsecureTls)) return server;
    if (Date.now() >= deadline) {
      await server.stop();
      throw new Error(
        `--start command did not serve ${options.url} within ${timeoutMs}ms. ` +
          `Raise --start-timeout, or check the command actually listens on that URL.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
