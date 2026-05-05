import { describe, expect, it } from "vitest";
import { renderSnapshotDiff } from "./render-snapshot";
import type { SnapshotDiff } from "@/lib/snapshots/diff";

function diff(entries: SnapshotDiff["entries"], identical = false): SnapshotDiff {
  return { route: "/", identical, entries };
}

describe("renderSnapshotDiff", () => {
  it("reports a clean run when identical", () => {
    const out = renderSnapshotDiff(diff([], true));
    expect(out).toContain("no changes since the committed snapshot.");
  });

  it("reports a write when --update produced a path", () => {
    const out = renderSnapshotDiff(diff([], true), {
      written: "/tmp/.headlint/snapshots/_root.json",
    });
    expect(out).toContain("wrote: /tmp/.headlint/snapshots/_root.json");
    expect(out).not.toContain("no changes since");
  });

  it("groups entries by class with the right prefixes", () => {
    const out = renderSnapshotDiff(
      diff([
        { class: "regression", kind: "tag", key: "meta:og:image[0]", before: "x" },
        {
          class: "regression",
          kind: "rule-outcome",
          key: "og.image.missing",
          after: "error",
        },
        { class: "addition", kind: "jsonld-type", key: "WebSite" },
        {
          class: "content-drift",
          kind: "tag",
          key: "title",
          before: "Old title",
          after: "New title",
        },
      ]),
    );
    expect(out).toMatch(/Regressions \(2\)/);
    expect(out).toMatch(/Additions \(1\)/);
    expect(out).toMatch(/Content drift \(1\)/);
    expect(out).toContain("  ! tag: meta:og:image[0]");
    expect(out).toContain("  ! rule: og.image.missing");
    expect(out).toContain("  + json-ld type: WebSite");
    expect(out).toContain("  ~ tag: title");
  });

  it("truncates very long values in suffixes", () => {
    const long = "x".repeat(100);
    const out = renderSnapshotDiff(
      diff([{ class: "content-drift", kind: "tag", key: "title", before: long, after: long }]),
    );
    expect(out).toMatch(/x{59}…/);
  });

  it("renders a single-side suffix when only after or only before is set", () => {
    const out = renderSnapshotDiff(
      diff([
        { class: "addition", kind: "tag", key: "x", after: "Y" },
        { class: "regression", kind: "tag", key: "z", before: "Z" },
      ]),
    );
    expect(out).toContain("+ tag: x  (+Y)");
    expect(out).toContain("! tag: z  (-Z)");
  });

  it("shows the route header", () => {
    const out = renderSnapshotDiff({ route: "/blog/post-1", identical: true, entries: [] });
    expect(out).toContain("route: /blog/post-1");
  });
});
