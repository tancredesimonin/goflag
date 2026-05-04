import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Page } from "@/lib/core/types";

const runInspectMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("@/app/actions/inspect", () => ({
  runInspect: (...args: unknown[]) => runInspectMock(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: refreshMock }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { PageHeaderCard } from "./page-header-card";

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    schemaVersion: 2,
    fetchedAt: new Date(0).toISOString(),
    fetch: {
      requestedUrl: "https://example.com",
      finalUrl: "https://example.com",
      status: 200,
      statusText: "OK",
      durationMs: 123,
      bodyBytes: 4096,
      redirectCount: 0,
      contentType: "text/html",
      headers: {},
    },
    extractor: { mode: "static", escalated: false },
    html: { static: "<html></html>" },
    raw: {
      title: "Example",
      htmlLang: "en",
      metas: [],
      links: [],
      scripts: [],
    },
    meta: {
      title: { value: "Example", origin: { kind: "title" } },
      description: {
        value: "An example",
        origin: { kind: "meta", name: "description" },
      },
      canonical: {
        value: "https://example.com/",
        origin: { kind: "link", rel: "canonical" },
      },
    },
    openGraph: { localeAlternates: [], images: [], unknown: [] },
    twitter: {},
    links: { alternates: [], icons: [], feeds: [], preconnects: [], dnsPrefetches: [] },
    jsonLd: [],
    probes: {},
    ...overrides,
  } as unknown as Page;
}

describe("<PageHeaderCard />", () => {
  beforeEach(() => {
    runInspectMock.mockReset();
    refreshMock.mockReset();
  });

  it("renders the canonical, status, and extractor mode of a static page", () => {
    render(<PageHeaderCard page={makePage()} />);
    expect(screen.getByTestId("header-title")).toHaveTextContent("Example");
    expect(screen.getByTestId("header-description")).toHaveTextContent("An example");
    expect(screen.getByTestId("header-status")).toHaveTextContent("200");
    expect(screen.getByTestId("header-url")).toHaveTextContent("https://example.com");
  });

  it("flags the auto-escalated headless run with a dedicated badge", () => {
    render(
      <PageHeaderCard
        page={makePage({
          extractor: {
            mode: "headless",
            escalated: true,
            escalationReason: "static head looked empty",
          },
        })}
      />,
    );
    expect(screen.getByText("headless · auto")).toBeInTheDocument();
  });

  it("re-runs the action and refreshes the route when Re-fetch is clicked", async () => {
    runInspectMock.mockResolvedValueOnce({ ok: true, url: "https://example.com" });
    render(<PageHeaderCard page={makePage()} />);
    fireEvent.click(screen.getByTestId("refetch-button"));
    await waitFor(() => {
      expect(runInspectMock).toHaveBeenCalledWith({ url: "https://example.com" });
    });
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("shows a placeholder when no description is present", () => {
    const page = makePage();
    delete page.meta.description;
    render(<PageHeaderCard page={page} />);
    expect(screen.queryByTestId("header-description")).toBeNull();
    expect(
      screen.getByText((_, el) => el?.textContent === 'No <meta name="description">'),
    ).toBeInTheDocument();
  });

  it("annotates non-2xx fetches with a destructive status badge", () => {
    render(
      <PageHeaderCard
        page={makePage({
          fetch: {
            requestedUrl: "https://example.com",
            finalUrl: "https://example.com",
            status: 404,
            statusText: "Not Found",
            durationMs: 50,
            bodyBytes: 0,
            redirectCount: 0,
            contentType: "text/html",
            headers: {},
          },
        })}
      />,
    );
    expect(screen.getByTestId("header-status")).toHaveTextContent("404");
  });

  it("shows redirect count when the final URL differs from the requested one", () => {
    render(
      <PageHeaderCard
        page={makePage({
          fetch: {
            requestedUrl: "http://example.com",
            finalUrl: "https://example.com/en",
            status: 200,
            statusText: "OK",
            durationMs: 10,
            bodyBytes: 100,
            redirectCount: 2,
            contentType: "text/html",
            headers: {},
          },
        })}
      />,
    );
    expect(screen.getByText(/https:\/\/example\.com\/en \(2×\)/)).toBeInTheDocument();
  });
});
