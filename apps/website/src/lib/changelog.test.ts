import { describe, expect, it } from "vitest";

import { getChangelog, parseChangelog } from "./changelog";

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

  it("still splits entries that stand on one line", () => {
    const [release] = parseChangelog(MULTILINE, "next");
    const features = release?.sections.find((section) => section.id === "features");

    expect(features?.entries).toHaveLength(1);
    expect(features?.entries[0]?.scope).toBe("next");
    expect(features?.entries[0]?.sha).toBe("c762983");
  });
});

describe("getChangelog", () => {
  it("carries both packages, newest first", () => {
    const releases = getChangelog();
    const packages = new Set(releases.map((release) => release.package));

    expect(packages).toEqual(new Set(["cli", "next"]));

    const dates = releases.map((release) => release.date ?? "");
    expect([...dates]).toEqual([...dates].sort().reverse());
  });
});
