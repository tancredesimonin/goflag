import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  FIXTURE_SECRET,
  renderJunitFixture,
  renderReportFixture,
} from "../../scripts/report-fixture";

const here = dirname(fileURLToPath(import.meta.url));
const committed = readFileSync(join(here, "..", "fixtures", "transcripts", "report.html"), "utf8");
const committedJunit = readFileSync(
  join(here, "..", "fixtures", "transcripts", "report.junit.xml"),
  "utf8",
);

describe("the committed HTML report", () => {
  it("matches the renderer, byte for byte", () => {
    expect(committed).toBe(renderReportFixture());
  });

  it("is one file: no script, no stylesheet, no image, no font to fetch", () => {
    // A pipeline artefact is opened from a download folder, offline, by
    // someone who may not be allowed to load anything from the internet. The
    // only URLs it may hold are links the reader chooses to follow.
    expect(committed).not.toMatch(/<script\b/i);
    expect(committed).not.toMatch(/<link\b/i);
    expect(committed).not.toMatch(/\bsrc=/i);
    expect(committed).not.toMatch(/@import|url\(/i);
  });

  it("names the header it was sent with and prints its value nowhere", () => {
    expect(committed).toContain("x-vercel-protection-bypass");
    expect(committed).toContain("x-vercel-protection-bypass: ***");
    expect(committed).not.toContain(FIXTURE_SECRET);
  });

  it("says why the gate decided what it did", () => {
    expect(committed).toContain("Failed · exit code 1");
    expect(committed).toContain("1 new finding at warning or error since the baseline.");
    expect(committed).toContain("14 days old");
  });
});

describe("the committed JUnit report", () => {
  it("matches the renderer, byte for byte", () => {
    expect(committedJunit).toBe(renderJunitFixture());
  });

  it("fails the gate case with the reason the HTML report gives", () => {
    expect(committedJunit).toContain('<testcase classname="goflag" name="gate">');
    expect(committedJunit).toContain(
      'message="1 new finding at warning or error since the baseline."',
    );
  });

  it("carries no header value either", () => {
    expect(committedJunit).not.toContain(FIXTURE_SECRET);
  });
});
