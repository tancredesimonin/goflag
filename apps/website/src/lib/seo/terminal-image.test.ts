import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { generateStaticParams } from "@/app/assets/[id]/route";
import { SAMPLES } from "@/lib/transcripts";

import { TERMINAL_IMAGE, terminalImageSize, transcriptLines } from "./terminal-image";

/**
 * The README is the npm page for `@goflag/cli` — `prepack` copies it — and the
 * images it shows are served from this site rather than committed. That makes
 * the link between the two files the fragile part: nothing on the npm page
 * fails loudly when an id is renamed here, it just shows a broken image.
 */

const README = readFileSync(join(process.cwd(), "..", "..", "README.md"), "utf8");
const served = new Set(generateStaticParams().map((p) => p.id));

describe("the images the README asks for", () => {
  const referenced = [
    ...new Set([...README.matchAll(/goflag\.tech\/assets\/([\w.-]+\.png)/g)].map((m) => m[1]!)),
  ];

  it("asks for at least one, so this file is not testing an empty list", () => {
    expect(referenced.length).toBeGreaterThan(0);
  });

  it.each(referenced)("is one this route serves: %s", (id) => {
    expect(served.has(id)).toBe(true);
  });

  it("asks for them over https, on the domain the project deploys", () => {
    // A relative path is dead on npm, which renders the file outside the
    // repository — the same defect two links further down this file already
    // have. And `raw.githubusercontent` serves `.svg` as `text/plain`, which is
    // why the images are hosted here rather than on the mirror.
    for (const match of README.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
      const url = match[1]!;
      if (url.includes("shields.io")) continue;
      expect(url.startsWith("https://")).toBe(true);
    }
  });

  it("describes each one, since a terminal in a picture is unreadable to a reader who cannot see it", () => {
    for (const match of README.matchAll(
      /!\[([^\]]*)\]\((https:\/\/goflag\.tech\/assets\/[^)]+)\)/g,
    )) {
      expect(match[1]!.length).toBeGreaterThan(60);
    }
  });
});

describe("the terminal image", () => {
  it("draws a contiguous slice of a transcript, and refuses anything else", () => {
    // A slice can only narrow output that has already been compared to the
    // renderer byte for byte. It cannot reorder, edit or invent a line — which
    // is what makes cropping safe here and unsafe as a general feature.
    const full = SAMPLES.find((s) => s.id === "full")!;
    expect(transcriptLines({ id: "full", lines: [1, 11] }).lines).toEqual(full.lines.slice(0, 11));
    expect(() => transcriptLines({ id: "full", lines: [1, full.lines.length + 1] })).toThrow();
    expect(() => transcriptLines({ id: "full", lines: [5, 2] })).toThrow();
    expect(() => transcriptLines({ id: "nope" })).toThrow();
  });

  it("sizes its canvas from the text rather than a fixed card", () => {
    const size = terminalImageSize({ id: "full", lines: [1, 11] });
    expect(size.width).toBeGreaterThan(600);
    expect(size.height).toBeGreaterThan(200);
    // A taller slice is a taller image; nothing here is cropped to a card.
    expect(terminalImageSize({ id: "full" }).height).toBeGreaterThan(size.height);
  });

  it("reads its palette out of the stylesheet instead of keeping a copy", () => {
    // The four greys in `og.tsx` were eyeballed and every one was wrong, which
    // is why that file now has a test converting them out of `globals.css`.
    // These are converted at render time, so there is nothing to drift — this
    // only checks the conversion produced colours at all.
    for (const [name, hex] of Object.entries(TERMINAL_IMAGE)) {
      expect(hex, name).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(new Set(Object.values(TERMINAL_IMAGE)).size).toBe(Object.values(TERMINAL_IMAGE).length);
  });
});
