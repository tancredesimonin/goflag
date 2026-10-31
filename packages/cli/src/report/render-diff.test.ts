/**
 * The note a run prints when it declared something else about indexing than the
 * baseline did. A fact with no instruction in it: a merge-request job and a deployed
 * job read one baseline and rightly declare two things.
 */

import { describe, expect, it } from "vitest";

import type { ReportDiff } from "./diff";
import { renderDiffTerminal } from "./render-diff";

const NOW = Date.parse("2026-08-04T09:14:02.881Z");

const diff = (indexingMismatch?: ReportDiff["indexingMismatch"]): ReportDiff => ({
  baseline: {
    url: "https://example.com/",
    finishedAt: "2026-08-04T00:00:00.000Z",
    profile: "default",
  },
  added: [],
  resolved: [],
  unchanged: 0,
  ...(indexingMismatch ? { indexingMismatch } : {}),
});

const render = (value: ReportDiff) => renderDiffTerminal(value, { color: false, now: NOW });

describe("the indexing note", () => {
  it("prints nothing when the two agree", () => {
    expect(render(diff())).not.toContain("--expect-indexing");
  });

  it.each([
    [null, "no", "captured with no `--expect-indexing`, this run used `--expect-indexing no`"],
    ["no", null, "captured with `--expect-indexing no`, this run used no `--expect-indexing`"],
    ["no", "yes", "captured with `--expect-indexing no`, this run used `--expect-indexing yes`"],
  ])("says what each declared: %s then %s", (baseline, current, expected) => {
    const out = render(diff({ baseline, current }));

    expect(out).toContain(expected);
    expect(out).toContain("may be the declaration");
  });

  it("gives no instruction, which would turn the other job red", () => {
    expect(render(diff({ baseline: "no", current: "yes" }))).not.toMatch(/capture it again/i);
  });
});
