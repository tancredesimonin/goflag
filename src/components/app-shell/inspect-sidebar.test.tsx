import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("url=https%3A%2F%2Fexample.com%2Ffr"),
}));

import { SidebarProvider } from "@/components/ui/sidebar";
import { InspectSidebar, type InspectSidebarItem } from "./inspect-sidebar";

const items: InspectSidebarItem[] = [
  {
    url: "https://example.com/en",
    finalUrl: "https://example.com/en",
    title: "English homepage",
    locale: "en",
    storedAt: 0,
    status: 200,
    extractor: "static",
  },
  {
    url: "https://example.com/fr",
    finalUrl: "https://example.com/fr",
    title: "Page d'accueil",
    locale: "fr",
    storedAt: 0,
    status: 200,
    extractor: "headless",
  },
  {
    url: "https://example.com/dead",
    finalUrl: "https://example.com/dead",
    title: "404",
    locale: "",
    storedAt: 0,
    status: 404,
    extractor: "static",
  },
];

function renderWithShell(items: InspectSidebarItem[]) {
  return render(
    <SidebarProvider>
      <InspectSidebar items={items} />
    </SidebarProvider>,
  );
}

describe("<InspectSidebar />", () => {
  it("groups items by locale, putting unspecified last", () => {
    renderWithShell(items);
    const groups = Array.from(document.querySelectorAll("[data-sidebar=group-label]")).map(
      (el) => el.textContent ?? "",
    );
    expect(groups[0]).toMatch(/en/);
    expect(groups[1]).toMatch(/fr/);
    expect(groups.at(-1)).toMatch(/Unspecified/);
  });

  it("renders one row per inspected URL", () => {
    renderWithShell(items);
    expect(screen.getAllByTestId("sidebar-item").map((el) => el.dataset.url)).toEqual([
      "https://example.com/en",
      "https://example.com/fr",
      "https://example.com/dead",
    ]);
  });

  it("shows an empty-state when no items are cached", () => {
    renderWithShell([]);
    expect(screen.getByText(/No URLs inspected yet/)).toBeInTheDocument();
  });

  it("badges headless items and 4xx statuses distinctively", () => {
    renderWithShell(items);
    expect(screen.getByText("JS")).toBeInTheDocument();
    const dead = screen
      .getAllByTestId("sidebar-item")
      .find((el) => el.dataset.url === "https://example.com/dead");
    expect(dead?.textContent).toContain("404");
  });
});
