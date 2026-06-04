import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteUrlList } from "./site-url-list";

const urls = [
  { loc: "https://example.com/" },
  { loc: "https://example.com/about" },
  { loc: "https://example.com/blog/first", lastmod: "2026-01-05" },
  { loc: "https://example.com/blog/second" },
];

describe("<SiteUrlList />", () => {
  it("renders one row per URL linking to /inspect", () => {
    render(<SiteUrlList urls={urls} />);
    const items = screen.getAllByTestId("site-url-item");
    expect(items).toHaveLength(4);
    const blog = items.find((el) => el.dataset.url === "https://example.com/blog/first");
    expect(blog?.getAttribute("href")).toBe(
      "/inspect?url=https%3A%2F%2Fexample.com%2Fblog%2Ffirst",
    );
  });

  it("groups by first path segment with the root first", () => {
    render(<SiteUrlList urls={urls} />);
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent ?? "");
    expect(headings[0]).toMatch(/^\//);
    expect(headings.some((h) => h.includes("/blog"))).toBe(true);
  });

  it("filters the list by query", () => {
    render(<SiteUrlList urls={urls} />);
    fireEvent.change(screen.getByTestId("site-url-filter"), { target: { value: "blog" } });
    const items = screen.getAllByTestId("site-url-item");
    expect(items).toHaveLength(2);
    expect(items.every((el) => el.dataset.url?.includes("/blog/"))).toBe(true);
  });

  it("shows an empty message when nothing matches", () => {
    render(<SiteUrlList urls={urls} />);
    fireEvent.change(screen.getByTestId("site-url-filter"), { target: { value: "zzz" } });
    expect(screen.getByText(/No URLs match/)).toBeInTheDocument();
  });

  it("marks already-inspected URLs", () => {
    render(<SiteUrlList urls={urls} inspectedUrls={["https://example.com/about"]} />);
    const about = screen
      .getAllByTestId("site-url-item")
      .find((el) => el.dataset.url === "https://example.com/about");
    // The inspected marker (CheckCircle2) renders an svg with the emerald class.
    expect(about?.querySelector("svg.text-emerald-500")).not.toBeNull();
  });

  it("renders per-entry reachability status badges when provided", () => {
    render(
      <SiteUrlList
        urls={urls}
        statuses={{
          "https://example.com/about": { verdict: "broken", status: 404 },
        }}
      />,
    );
    const badge = screen.getByTestId("site-url-status");
    expect(badge.dataset.verdict).toBe("broken");
    expect(badge.textContent).toBe("broken");
  });
});
