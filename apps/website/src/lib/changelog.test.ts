import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PACKAGES, getChangelog, parseChangelog } from "./changelog";

const MULTILINE = `# @goflag/next changelog

## 0.2.0 (2026-08-08)

### ⚠ BREAKING CHANGES

* **next:** \`locales\` refuses tags naming no real language or region;
\`bcp47()\` returns the canonical case rather than the declared string; and
\`localeTags.openGraph\` becomes unnecessary rather than required.

### Features

* **next:** add the route registry ([c762983](https://example.com/commit/c762983))
`;

describe("parseChangelog", () => {
  it("keeps a reflowed entry whole", () => {
    const [release] = parseChangelog(MULTILINE, "next");
    const breaking = release?.sections.find((section) => section.id === "breaking");

    // The generator wraps a long BREAKING CHANGE body across three lines.
    // Reading only the first printed a sentence that stopped at a semicolon.
    expect(breaking?.entries[0]?.subject).toContain("becomes unnecessary rather than required");
    expect(breaking?.entries).toHaveLength(1);
  });

  it("reads the breaking heading through its warning sign", () => {
    const [release] = parseChangelog(MULTILINE, "next");

    // The generator writes "⚠ BREAKING CHANGES". Matching the label literally
    // dropped it into `other`, which rendered the one thing a reader has to act
    // on last, under "Other changes".
    expect(release?.sections.map((section) => section.id)).toContain("breaking");
  });

  it("reads the date of a first release, which carries no compare link", () => {
    const [release] = parseChangelog(MULTILINE, "next");

    expect(release?.version).toBe("0.2.0");
    expect(release?.date).toBe("2026-08-08");
    expect(release?.compareUrl).toBeNull();
    expect(release?.package).toBe("next");
  });

  it("gives performance its own section, under the heading the CLI's generator writes", () => {
    // Read from `.versionrc.json` rather than typed here: the heading is the
    // generator's decision, and a rename there should fail this test rather
    // than quietly send every `perf` entry back under "Other changes".
    const versionrc = JSON.parse(
      readFileSync(join(process.cwd(), "..", "..", "packages", "cli", ".versionrc.json"), "utf8"),
    ) as { types: { type: string; section: string }[] };
    const heading = versionrc.types.find((type) => type.type === "perf")?.section;

    const [release] = parseChangelog(
      `## 0.2.15 (2026-10-24)\n\n### ${heading}\n\n* **cli:** the crawl is faster ([c303ad4](https://example.com/commit/c303ad4))\n`,
      "cli",
    );

    expect(release?.sections.map((section) => section.id)).toEqual(["perf"]);
  });

  it("still splits entries that stand on one line", () => {
    const [release] = parseChangelog(MULTILINE, "next");
    const features = release?.sections.find((section) => section.id === "features");

    expect(features?.entries).toHaveLength(1);
    expect(features?.entries[0]?.scope).toBe("next");
    expect(features?.entries[0]?.sha).toBe("c762983");
  });
});

describe("getChangelog", () => {
  it("carries every published package, newest first", () => {
    // Against `PACKAGES` rather than a literal. The page's lead promises it
    // cannot drift from what actually shipped, and it had — `@goflag/og` was
    // published, released a breaking version, and appeared nowhere, because a
    // hand-written pair here agreed with a hand-written pair there.
    const releases = getChangelog();
    const packages = new Set(releases.map((release) => release.package));

    expect(packages).toEqual(new Set(PACKAGES));

    const dates = releases.map((release) => release.date ?? "");
    expect([...dates]).toEqual([...dates].sort().reverse());
  });
});
