import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrokenLinksTable } from "./broken-links-table";
import type { LinkRow } from "@/lib/core/links/report";
import type { LinkCheck, LinkVerdict } from "@/lib/core/links/types";

function check(url: string, verdict: LinkVerdict, status: number): LinkCheck {
  return {
    url,
    finalUrl: url,
    status,
    verdict,
    method: "GET",
    redirectChain: [],
    reason: verdict === "broken" ? `${status}` : undefined,
    checkedAt: "2024-01-01T00:00:00.000Z",
    durationMs: 1,
  };
}

const rows: LinkRow[] = [
  {
    check: check("https://site.example/dead", "broken", 404),
    kind: "internal",
    host: "site.example",
    sources: [
      { pageUrl: "https://site.example/", anchorText: "Dead", source: "a", rel: [] },
      { pageUrl: "https://site.example/blog", anchorText: "Dead too", source: "a", rel: [] },
    ],
  },
  {
    check: check("https://other.example/x", "blocked", 403),
    kind: "external",
    host: "other.example",
    sources: [{ pageUrl: "https://site.example/", source: "a", rel: ["nofollow"] }],
  },
  {
    check: check("https://site.example/ok", "ok", 200),
    kind: "internal",
    host: "site.example",
    sources: [{ pageUrl: "https://site.example/", source: "a", rel: [] }],
  },
];

describe("<BrokenLinksTable />", () => {
  it("defaults to showing problem verdicts (broken/blocked/warning), hiding ok", () => {
    render(<BrokenLinksTable rows={rows} hosts={["other.example", "site.example"]} />);
    const items = screen.getAllByTestId("link-row");
    expect(items).toHaveLength(2);
    expect(items.every((el) => el.dataset.verdict !== "ok")).toBe(true);
  });

  it("toggles a verdict filter to reveal ok links", () => {
    render(<BrokenLinksTable rows={rows} hosts={["other.example", "site.example"]} />);
    const okFilter = screen
      .getAllByTestId("verdict-filter")
      .find((el) => el.dataset.verdict === "ok");
    expect(okFilter).toBeDefined();
    fireEvent.click(okFilter!);
    expect(screen.getAllByTestId("link-row")).toHaveLength(3);
  });

  it("filters by scope (internal/external)", () => {
    render(<BrokenLinksTable rows={rows} hosts={["other.example", "site.example"]} />);
    const external = screen
      .getAllByTestId("kind-filter")
      .find((el) => el.dataset.kind === "external");
    fireEvent.click(external!);
    const items = screen.getAllByTestId("link-row");
    expect(items).toHaveLength(1);
    expect(items[0]?.dataset.kind).toBe("external");
  });

  it("filters by host", () => {
    render(<BrokenLinksTable rows={rows} hosts={["other.example", "site.example"]} />);
    fireEvent.change(screen.getByTestId("host-filter"), { target: { value: "other.example" } });
    const items = screen.getAllByTestId("link-row");
    expect(items).toHaveLength(1);
    expect(items[0]?.dataset.verdict).toBe("blocked");
  });

  it("expands the source-page list on demand", () => {
    render(<BrokenLinksTable rows={rows} hosts={["other.example", "site.example"]} />);
    expect(screen.queryByTestId("source-pages")).toBeNull();
    const toggles = screen.getAllByTestId("toggle-sources");
    fireEvent.click(toggles[0]!);
    expect(screen.getByTestId("source-pages")).toBeInTheDocument();
  });

  it("shows the reason and an empty state when filters exclude everything", () => {
    render(<BrokenLinksTable rows={rows} hosts={["other.example", "site.example"]} />);
    expect(screen.getAllByTestId("link-reason")[0]?.textContent).toContain("404");
    // External scope leaves only the blocked row; turning off "blocked"
    // (the broken row is internal) yields an empty result.
    const external = screen
      .getAllByTestId("kind-filter")
      .find((el) => el.dataset.kind === "external");
    fireEvent.click(external!);
    const blocked = screen
      .getAllByTestId("verdict-filter")
      .find((el) => el.dataset.verdict === "blocked");
    fireEvent.click(blocked!);
    expect(screen.getByTestId("links-empty")).toBeInTheDocument();
  });
});
