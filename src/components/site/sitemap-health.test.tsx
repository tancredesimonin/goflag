import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SitemapHealthChecklist } from "./sitemap-health";
import type { SitemapHealth } from "@/lib/core/sitemap/analyze";

function health(overrides: Partial<SitemapHealth> = {}): SitemapHealth {
  return {
    lastmodIssues: 0,
    mixedProtocol: false,
    mixedHost: false,
    reachable: { checked: 10, ok: 9, broken: 1, redirected: 0 },
    robotsConflicts: 0,
    orphanCount: 0,
    orphans: [],
    checks: {},
    truncated: false,
    ...overrides,
  };
}

describe("<SitemapHealthChecklist />", () => {
  it("shows the reachable percentage and broken count", () => {
    render(<SitemapHealthChecklist health={health()} />);
    expect(screen.getByTestId("reachable-pct").textContent).toContain("90%");
    expect(screen.getByTestId("reachable-stats").textContent).toContain("Broken");
  });

  it("flags failing checks (mixed protocol, lastmod, robots)", () => {
    render(
      <SitemapHealthChecklist
        health={health({ mixedProtocol: true, lastmodIssues: 3, robotsConflicts: 2 })}
      />,
    );
    const failing = screen.getAllByTestId("health-check").filter((el) => el.dataset.ok === "false");
    expect(failing.length).toBeGreaterThanOrEqual(3);
  });

  it("lists orphan pages when present", () => {
    render(
      <SitemapHealthChecklist
        health={health({ orphanCount: 1, orphans: ["https://x.example/orphan"] })}
      />,
    );
    expect(screen.getByTestId("orphan-list").textContent).toContain("/orphan");
  });
});
