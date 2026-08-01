/**
 * Live progress logger for the CLI.
 *
 * Everything here writes to a *side* stream (stderr by default) so the JSON
 * report on stdout is never polluted. Three modes:
 *
 *   - "compact" (default): a single, in-place status line — spinner +
 *     progress bar + "done/total" + the current page. On a non-TTY (CI,
 *     pipes) it degrades to throttled plain lines so logs stay readable.
 *   - "verbose": one line per page as it is analyzed (status + URL), plus
 *     phase headers. No spinner; lines scroll.
 *   - "quiet": nothing at all.
 *
 * The logger is fed `ProgressEvent`s (see `./build.ts`) via `onProgress`,
 * and the CLI calls `note()` for banners/warnings and `stop()` at the end.
 */

import type { ProgressEvent } from "./build";

export type LogMode = "compact" | "verbose" | "quiet";

interface WriteStreamLike {
  write(chunk: string): boolean;
  isTTY?: boolean;
  columns?: number;
}

export interface LoggerOptions {
  /** Destination stream. Defaults to `process.stderr`. */
  stream?: WriteStreamLike;
  /** Emit ANSI colour. Defaults to `stream.isTTY`. */
  color?: boolean;
  /** Display mode. Defaults to "compact". */
  mode?: LogMode;
  /** Spinner tick interval in ms. `0` disables the animating timer (tests). */
  spinnerIntervalMs?: number;
  /** Minimum gap between plain progress lines on a non-TTY. Defaults to 250. */
  throttleMs?: number;
  /** Injectable clock (tests). */
  now?: () => number;
}

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const BAR_WIDTH = 18;

const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

const PHASE_LABEL: Record<ProgressEvent["phase"], string> = {
  crawl: "crawl",
  scan: "scan",
  links: "links",
};

const PHASE_HEADER: Record<ProgressEvent["phase"], string> = {
  crawl: "Crawling pages",
  scan: "Scanning pages for links",
  links: "Checking links",
};

const PHASE_DONE_NOUN: Record<ProgressEvent["phase"], string> = {
  crawl: "pages",
  scan: "pages scanned",
  links: "links",
};

export class Logger {
  private readonly stream: WriteStreamLike;
  private readonly color: boolean;
  private readonly mode: LogMode;
  private readonly isTTY: boolean;
  private readonly spinnerIntervalMs: number;
  private readonly throttleMs: number;
  private readonly now: () => number;

  private timer: ReturnType<typeof setInterval> | undefined;
  private frame = 0;
  private last: ProgressEvent | undefined;
  private lineOpen = false;
  private lastPlainAt = 0;
  private headerShown: Partial<Record<ProgressEvent["phase"], boolean>> = {};

  constructor(options: LoggerOptions = {}) {
    this.stream = options.stream ?? process.stderr;
    this.isTTY = this.stream.isTTY === true;
    this.color = options.color ?? this.isTTY;
    this.mode = options.mode ?? "compact";
    this.spinnerIntervalMs = options.spinnerIntervalMs ?? 80;
    this.throttleMs = options.throttleMs ?? 250;
    this.now = options.now ?? Date.now;
  }

  private paint(code: string, text: string): string {
    return this.color ? `${code}${text}${ANSI.reset}` : text;
  }

  /** Print a standalone line (banner, warning). Survives around the spinner. */
  note(message: string): void {
    if (this.mode === "quiet") return;
    this.clearLine();
    this.stream.write(`${this.paint(ANSI.dim, message)}\n`);
    if (this.mode === "compact" && this.last) this.render();
  }

  /** Feed one progress tick. */
  onProgress = (event: ProgressEvent): void => {
    if (this.mode === "quiet") return;
    this.last = event;

    if (this.mode === "verbose") {
      this.verboseLine(event);
      return;
    }

    // compact
    if (this.isTTY) {
      this.ensureTimer();
      this.render();
    } else {
      this.plainThrottled(event);
    }
  };

  /** Stop the spinner and clear the status line so the report starts clean. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.clearLine();
  }

  // --- rendering ---------------------------------------------------------

  private ensureTimer(): void {
    if (this.timer || this.spinnerIntervalMs <= 0) return;
    this.timer = setInterval(() => {
      this.frame = (this.frame + 1) % FRAMES.length;
      this.render();
    }, this.spinnerIntervalMs);
    // Don't keep the process alive just for the spinner.
    (this.timer as { unref?: () => void }).unref?.();
  }

  private render(): void {
    if (!this.last) return;
    const line = this.composeLine(this.last);
    if (this.isTTY) {
      this.stream.write(`\r\x1b[2K${line}`);
      this.lineOpen = true;
    } else {
      this.stream.write(`${line}\n`);
    }
  }

  private composeLine(e: ProgressEvent): string {
    const spinner = this.paint(ANSI.cyan, FRAMES[this.frame]!);
    const phase = this.paint(ANSI.bold, PHASE_LABEL[e.phase]);
    const counts = `${e.done}/${e.total}`;
    const bar = this.bar(e.done, e.total);
    const subject = e.url ? this.paint(ANSI.dim, this.truncate(e.url)) : "";
    return [spinner, phase, bar, counts, subject].filter(Boolean).join("  ");
  }

  private bar(done: number, total: number): string {
    if (total <= 0) return "";
    const ratio = Math.max(0, Math.min(1, done / total));
    const filled = Math.round(ratio * BAR_WIDTH);
    const bar = "█".repeat(filled) + "░".repeat(BAR_WIDTH - filled);
    return this.paint(ANSI.dim, `[${bar}]`);
  }

  private verboseLine(e: ProgressEvent): void {
    if (!this.headerShown[e.phase]) {
      this.headerShown[e.phase] = true;
      this.stream.write(`${this.paint(ANSI.bold, PHASE_HEADER[e.phase])}\n`);
    }
    if (e.phase === "crawl" && e.url) {
      const counts = this.paint(ANSI.dim, `(${e.done}/${e.total})`);
      this.stream.write(`  ${this.statusTag(e.status)} ${e.url}  ${counts}\n`);
    } else if (e.phase === "scan" || e.phase === "links") {
      // Avoid a line per item; just mark completion of the phase.
      if (e.done === e.total && e.total > 0) {
        this.stream.write(`  ${this.paint(ANSI.dim, `${e.total} ${PHASE_DONE_NOUN[e.phase]}`)}\n`);
      }
    }
  }

  private statusTag(status: number | undefined): string {
    if (status === undefined) return this.paint(ANSI.dim, "···");
    if (status >= 200 && status < 300) return this.paint(ANSI.green, String(status));
    if (status >= 300 && status < 400) return this.paint(ANSI.yellow, String(status));
    return this.paint(ANSI.red, String(status));
  }

  private plainThrottled(e: ProgressEvent): void {
    const t = this.now();
    const done = e.done === e.total;
    if (!done && t - this.lastPlainAt < this.throttleMs) return;
    this.lastPlainAt = t;
    this.stream.write(`goflag: ${PHASE_LABEL[e.phase]} ${e.done}/${e.total}\n`);
  }

  private clearLine(): void {
    if (this.isTTY && this.lineOpen) {
      this.stream.write("\r\x1b[2K");
      this.lineOpen = false;
    }
  }

  private truncate(url: string): string {
    const width = this.stream.columns ?? 80;
    // Leave room for spinner + phase + bar + counts (~40 cols).
    const budget = Math.max(16, width - 44);
    if (url.length <= budget) return url;
    return `…${url.slice(url.length - budget + 1)}`;
  }
}
