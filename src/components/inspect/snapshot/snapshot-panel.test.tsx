import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SnapshotDiff } from "@/lib/snapshots/diff";
import { SnapshotPanel } from "./snapshot-panel";

vi.mock("@/app/actions/snapshot", () => ({
  acceptSnapshot: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

describe("<SnapshotPanel />", () => {
  it("renders the empty state with a Save button when no committed snapshot exists", () => {
    render(<SnapshotPanel route="/" url="https://example.com/" diff={null} />);
    expect(screen.getByTestId("snapshot-empty")).toBeInTheDocument();
    expect(screen.getByText(/No committed snapshot/i)).toBeInTheDocument();
    expect(screen.getByTestId("accept-snapshot")).toHaveTextContent(/Save snapshot/i);
  });

  it("renders the identical state when the committed snapshot matches", () => {
    const diff: SnapshotDiff = { route: "/", identical: true, entries: [] };
    render(<SnapshotPanel route="/" url="https://example.com/" diff={diff} />);
    expect(screen.getByTestId("snapshot-identical")).toBeInTheDocument();
    expect(screen.getByText(/No changes since/i)).toBeInTheDocument();
    expect(screen.queryByTestId("accept-snapshot")).toBeNull();
  });

  it("groups diff entries by class when there are differences", () => {
    const diff: SnapshotDiff = {
      route: "/",
      identical: false,
      entries: [
        { class: "regression", kind: "tag", key: "meta:og:image[0]", before: "x" },
        { class: "regression", kind: "rule-outcome", key: "og.image.missing", after: "error" },
        { class: "addition", kind: "jsonld-type", key: "WebSite" },
        {
          class: "content-drift",
          kind: "tag",
          key: "title",
          before: "Old",
          after: "New",
        },
      ],
    };
    render(<SnapshotPanel route="/" url="https://example.com/" diff={diff} />);
    expect(screen.getByTestId("snapshot-diff")).toBeInTheDocument();
    expect(screen.getByTestId("group-regressions")).toBeInTheDocument();
    expect(screen.getByTestId("group-additions")).toBeInTheDocument();
    expect(screen.getByTestId("group-content-drift")).toBeInTheDocument();
    expect(screen.getByTestId("accept-snapshot")).toHaveTextContent(/Accept changes/i);
    expect(screen.getByText("meta:og:image[0]")).toBeInTheDocument();
    expect(screen.getByText("og.image.missing")).toBeInTheDocument();
    expect(screen.getByText("WebSite")).toBeInTheDocument();
    expect(screen.getByText("title")).toBeInTheDocument();
  });

  it("hides empty groups", () => {
    const diff: SnapshotDiff = {
      route: "/",
      identical: false,
      entries: [{ class: "regression", kind: "tag", key: "title", before: "X" }],
    };
    render(<SnapshotPanel route="/" url="https://example.com/" diff={diff} />);
    expect(screen.getByTestId("group-regressions")).toBeInTheDocument();
    expect(screen.queryByTestId("group-additions")).toBeNull();
    expect(screen.queryByTestId("group-content-drift")).toBeNull();
  });

  it("renders before → after when both sides exist", () => {
    const diff: SnapshotDiff = {
      route: "/",
      identical: false,
      entries: [
        {
          class: "content-drift",
          kind: "tag",
          key: "title",
          before: "Old",
          after: "New",
        },
      ],
    };
    render(<SnapshotPanel route="/" url="https://example.com/" diff={diff} />);
    expect(screen.getByText("Old")).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
  });
});
