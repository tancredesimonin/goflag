/**
 * Logger tests. We feed a fake stream (no real stderr, no timers) and assert
 * on the captured output for each mode and TTY/non-TTY combination.
 */

import { describe, expect, it } from "vitest";

import { Logger } from "./logger";
import type { ProgressEvent } from "./build";

function fakeStream(isTTY: boolean) {
  const chunks: string[] = [];
  return {
    isTTY,
    columns: 80,
    write(s: string) {
      chunks.push(s);
      return true;
    },
    text: () => chunks.join(""),
    chunks,
  };
}

const crawl = (done: number, total: number, url: string, status = 200): ProgressEvent => ({
  phase: "crawl",
  done,
  total,
  url,
  status,
});

describe("Logger — quiet", () => {
  it("writes nothing at all", () => {
    const stream = fakeStream(false);
    const log = new Logger({ stream, mode: "quiet", spinnerIntervalMs: 0 });
    log.note("hello");
    log.onProgress(crawl(1, 3, "https://x/a"));
    log.stop();
    expect(stream.text()).toBe("");
  });
});

describe("Logger — verbose", () => {
  it("prints a phase header and a line per crawled page", () => {
    const stream = fakeStream(false);
    const log = new Logger({ stream, mode: "verbose", spinnerIntervalMs: 0 });
    log.onProgress(crawl(1, 3, "https://x/a", 200));
    log.onProgress(crawl(2, 3, "https://x/b", 404));
    log.stop();

    const out = stream.text();
    expect(out).toContain("Crawling pages");
    expect(out).toContain("https://x/a");
    expect(out).toContain("200");
    expect(out).toContain("https://x/b");
    expect(out).toContain("404");
    // The header appears exactly once even across multiple pages.
    expect(out.match(/Crawling pages/g)).toHaveLength(1);
  });

  it("summarizes the scan and link phases on completion only", () => {
    const stream = fakeStream(false);
    const log = new Logger({ stream, mode: "verbose", spinnerIntervalMs: 0 });
    log.onProgress({ phase: "scan", done: 1, total: 2 });
    log.onProgress({ phase: "scan", done: 2, total: 2 });
    log.onProgress({ phase: "links", done: 1, total: 3 });
    log.onProgress({ phase: "links", done: 3, total: 3 });
    log.stop();

    const out = stream.text();
    expect(out).toContain("Scanning pages for links");
    expect(out).toContain("2 pages scanned");
    expect(out).toContain("Checking links");
    expect(out).toContain("3 links");
    // No per-item spam: one completion line per phase.
    expect(out.match(/2 pages scanned/g)).toHaveLength(1);
  });
});

describe("Logger — compact (non-TTY)", () => {
  it("emits throttled plain lines, always flushing the final tick", () => {
    let clock = 1000;
    const stream = fakeStream(false);
    const log = new Logger({
      stream,
      mode: "compact",
      spinnerIntervalMs: 0,
      throttleMs: 100,
      now: () => clock,
    });

    log.onProgress(crawl(1, 10, "https://x/a")); // t=1000, prints
    log.onProgress(crawl(2, 10, "https://x/b")); // same tick, throttled out
    clock = 1200;
    log.onProgress(crawl(3, 10, "https://x/c")); // t=1200, prints
    log.onProgress(crawl(10, 10, "https://x/j")); // done===total, always prints
    log.stop();

    const lines = stream.chunks.filter((c) => c.includes("goflag:"));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("crawl 1/10");
    expect(lines[1]).toContain("crawl 3/10");
    expect(lines[2]).toContain("crawl 10/10");
  });
});

describe("Logger — compact (TTY)", () => {
  it("renders an in-place status line with spinner + bar, then clears on stop", () => {
    const stream = fakeStream(true);
    const log = new Logger({ stream, mode: "compact", spinnerIntervalMs: 0 });
    log.onProgress(crawl(4, 8, "https://example.com/page"));

    const rendered = stream.text();
    // Carriage return + clear-line control sequence for the in-place update.
    expect(rendered).toContain("\r\x1b[2K");
    // Progress bar glyphs.
    expect(rendered).toMatch(/[█░]/);
    expect(rendered).toContain("4/8");
    expect(rendered).toContain("example.com/page");

    log.stop();
    // The very last write clears the line so the report starts fresh.
    expect(stream.chunks.at(-1)).toBe("\r\x1b[2K");
  });

  it("note() clears the line, prints the message, and redraws progress", () => {
    const stream = fakeStream(true);
    const log = new Logger({ stream, mode: "compact", spinnerIntervalMs: 0, color: false });
    log.onProgress(crawl(1, 2, "https://x/a"));
    log.note("goflag: auditing …");
    const out = stream.text();
    expect(out).toContain("goflag: auditing …\n");
    // Progress is redrawn after the note.
    expect(out.lastIndexOf("1/2")).toBeGreaterThan(out.indexOf("goflag: auditing"));
  });
});

describe("Logger — color", () => {
  it("adds ANSI on a color stream and omits it otherwise", () => {
    const tty = fakeStream(true);
    new Logger({ stream: tty, mode: "verbose", spinnerIntervalMs: 0 }).onProgress(
      crawl(1, 1, "https://x/a"),
    );
    expect(tty.text()).toContain("\x1b[");

    const plain = fakeStream(false);
    new Logger({ stream: plain, mode: "verbose", spinnerIntervalMs: 0 }).onProgress(
      crawl(1, 1, "https://x/a"),
    );
    expect(plain.text()).not.toContain("\x1b[");
  });
});
