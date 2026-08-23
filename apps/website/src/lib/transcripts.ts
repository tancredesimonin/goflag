/**
 * The transcripts the CLI actually printed, read from the fixtures the
 * generator writes.
 *
 * This replaces a file that transcribed the three views by hand. That file
 * could only be kept in step by remembering to, and it was not: `[rigor]`
 * shipped on 2026-08-15 and the copy still showed `warn og.image.missing ×9`
 * four days later, under a caption reading "Real output". The README names
 * that failure mode — a sample presented as the truth — so the fix is not a
 * more careful transcription, it is not transcribing.
 *
 * The site cannot import `@goflag/cli` (invariant I3), so it reads the
 * generated files by relative path, exactly as `rules-catalog.ts` reads
 * `rules.json` and `changelog.ts` reads the changelogs. `packages/cli` writes
 * them with `pnpm --filter @goflag/cli generate:transcripts`, the pre-commit
 * hook runs that when `src/report/` is staged, and `transcripts.test.ts` over
 * there compares them to the renderers byte for byte.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The five colours the renderers paint with. `bold` is not one of them: it is
 * an attribute that combines with a colour — the counts line is bold *and*
 * yellow — so it rides on the span instead of competing for the slot.
 */
export type Tone = "dim" | "red" | "yellow" | "green" | "cyan";

export type Span = string | { t: string; tone?: Tone; bold?: true };

export type TerminalLine = readonly Span[];

export interface TerminalSample {
  readonly id: string;
  readonly command: string;
  readonly lines: readonly TerminalLine[];
}

/**
 * Built rather than written as a literal. A regex carrying a raw escape trips
 * `no-control-regex`, and the two ESLint configs this file answers to disagree
 * about whether the disable comment is then needed or redundant — so the honest
 * way out is to have nothing to disable.
 */
const ESC = "\u001b";

/** SGR code → what it turns on. The renderers emit these seven and no others. */
const TONES: Record<string, Tone> = {
  "2": "dim",
  "31": "red",
  "32": "green",
  "33": "yellow",
  "36": "cyan",
};

/**
 * Turn one ANSI-painted line into spans.
 *
 * Flat rather than a stack, because that is what a terminal does: the
 * renderers wrap with `${code}${text}\x1b[0m`, so a nested pair emits two
 * resets and the first one already cleared everything. Reproducing the stack
 * would show something no terminal shows.
 *
 * Unknown codes throw. Dropping them would let a renderer start painting in a
 * colour this file cannot name and have the site quietly render it as plain
 * text — the same silence the hand-written file failed in.
 */
function tokenise(line: string, id: string): Span[] {
  const spans: Span[] = [];
  let tone: Tone | undefined;
  let bold: true | undefined;
  let cursor = 0;

  const pattern = new RegExp(`${ESC}\\[([0-9]*)m`, "g");
  const push = (text: string) => {
    if (!text) return;
    spans.push(tone || bold ? { t: text, ...(tone && { tone }), ...(bold && { bold }) } : text);
  };

  for (let match = pattern.exec(line); match; match = pattern.exec(line)) {
    push(line.slice(cursor, match.index));
    cursor = match.index + match[0].length;

    const code = match[1] || "0";
    if (code === "0") {
      tone = undefined;
      bold = undefined;
    } else if (code === "1") {
      bold = true;
    } else if (TONES[code]) {
      tone = TONES[code];
    } else {
      throw new Error(
        `transcripts: ${id} paints with SGR ${code}, which this file cannot name. ` +
          `Add it to TONES and to the matching set in packages/cli/test/unit/transcripts.test.ts.`,
      );
    }
  }
  push(line.slice(cursor));
  return spans;
}

/**
 * Read at module load, which on this site is build time — every consumer is a
 * server component. Same resolution as `rules-catalog.ts`: relative to
 * `process.cwd()`, which Next sets to the app directory.
 */
const dir = join(process.cwd(), "..", "..", "packages", "cli", "test", "fixtures", "transcripts");

const MANIFEST: Array<{ id: string; command: string }> = JSON.parse(
  readFileSync(join(dir, "index.json"), "utf8"),
);

function read(id: string): TerminalSample {
  const raw = readFileSync(join(dir, `${id}.ansi`), "utf8");
  // The renderers open and close with a blank line so the output breathes in a
  // scrolling shell. The panel has padding for that, so the blanks are trimmed
  // at the edges only — never in the middle, where they separate the sections.
  const lines = raw.split("\n");
  while (lines.length && lines[0]!.trim() === "") lines.shift();
  while (lines.length && lines[lines.length - 1]!.trim() === "") lines.pop();

  return {
    id,
    command: MANIFEST.find((entry) => entry.id === id)!.command,
    lines: lines.map((line) => tokenise(line, id)),
  };
}

export const SAMPLES: readonly TerminalSample[] = MANIFEST.map((entry) => read(entry.id));

const byId = (id: string): TerminalSample => {
  const sample = SAMPLES.find((s) => s.id === id);
  if (!sample) {
    // Loud rather than blank: a tab rendering an empty panel looks like a
    // styling bug, and the cause would be a renamed fixture three packages away.
    throw new Error(
      `transcripts: no fixture \`${id}\`. Known: ${SAMPLES.map((s) => s.id).join(", ")}.`,
    );
  }
  return sample;
};

export const FULL_REPORT = byId("full");
export const SUMMARY_REPORT = byId("summary");
export const GATE_REPORT = byId("gate");
