import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SAMPLES } from "./transcripts";

/**
 * `<Terminal id="…">` in a documentation page paints the generated transcript
 * and ignores the fence written inside it. That fence is not decoration: it is
 * what `rawBody` carries, and therefore what `/raw/docs/<slug>.md` hands an
 * agent. Two copies of the same text is exactly the arrangement that rotted
 * `terminal-samples.ts`, so this pins one to the other.
 */

const DOCS = join(process.cwd(), "content", "docs");
const FIXTURES = join(
  process.cwd(),
  "..",
  "..",
  "packages",
  "cli",
  "test",
  "fixtures",
  "transcripts",
);

function mdxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? mdxFiles(join(dir, entry.name))
      : entry.name.endsWith(".mdx")
        ? [join(dir, entry.name)]
        : [],
  );
}

/** The transcript as the panel and the reader see it: edge blank lines gone. */
function trimmed(text: string): string {
  const lines = text.split("\n");
  while (lines.length && lines[0]!.trim() === "") lines.shift();
  while (lines.length && lines[lines.length - 1]!.trim() === "") lines.pop();
  return lines.join("\n");
}

const BLOCK = /<Terminal id="([^"]+)">\s*```plaintext\n([\s\S]*?)\n```\s*<\/Terminal>/g;

const uses = mdxFiles(DOCS).flatMap((file) =>
  [...readFileSync(file, "utf8").matchAll(BLOCK)].map(([, id, fence]) => ({
    file: file.slice(DOCS.length + 1),
    id: id!,
    fence: fence!,
  })),
);

describe("the transcripts the docs quote", () => {
  it("is used at all, so this file is not silently testing nothing", () => {
    // A regex that stops matching — a self-closing tag, a renamed fence
    // language — would make every assertion below vacuously pass.
    expect(uses.length).toBeGreaterThan(0);
  });

  it.each(uses.map((u) => [`${u.file} → ${u.id}`, u] as const))(
    "carries the generated text verbatim: %s",
    (_label, use) => {
      // The fence is never drawn, so nothing on the rendered page would look
      // wrong if it drifted. Only this fails.
      expect(use.fence).toBe(trimmed(readFileSync(join(FIXTURES, `${use.id}.txt`), "utf8")));
    },
  );

  it("names a transcript the site actually has", () => {
    const known = new Set(SAMPLES.map((s) => s.id));
    expect(uses.filter((use) => !known.has(use.id)).map((use) => `${use.file}: ${use.id}`)).toEqual(
      [],
    );
  });

  it("leaves no self-closing <Terminal>, which would empty the /raw surface", () => {
    // The tag renders identically either way, so this is the only thing
    // standing between a convenient edit and an agent-facing page that shows a
    // component name where a transcript used to be.
    const offenders = mdxFiles(DOCS)
      .filter((file) => /<Terminal[^>]*\/>/.test(readFileSync(file, "utf8")))
      .map((file) => file.slice(DOCS.length + 1));
    expect(offenders).toEqual([]);
  });
});
