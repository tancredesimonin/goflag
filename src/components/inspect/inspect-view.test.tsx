import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Page } from "@/lib/core/types";

vi.mock("@/lib/highlight", () => ({
  // Skip shiki in component tests — it's tested separately in lib/highlight
  // and ships a 200 KB+ wasm payload we don't want loaded for every render.
  highlightHtml: async (code: string) => `<pre class="shiki"><code>${code}</code></pre>`,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/app/actions/inspect", () => ({
  runInspect: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { InspectView } from "./inspect-view";

function makePage(): Page {
  return {
    schemaVersion: 2,
    fetchedAt: new Date(0).toISOString(),
    fetch: {
      requestedUrl: "https://example.com",
      finalUrl: "https://example.com",
      status: 200,
      statusText: "OK",
      durationMs: 1,
      bodyBytes: 10,
      redirectCount: 0,
      contentType: "text/html",
      headers: {},
    },
    extractor: { mode: "static", escalated: false },
    html: { static: "" },
    raw: {
      title: "Hello",
      htmlLang: "en",
      metas: [
        { name: "description", content: "Yo", attributes: { name: "description", content: "Yo" } },
      ],
      links: [
        {
          rel: "canonical",
          href: "https://example.com/",
          attributes: { rel: "canonical", href: "https://example.com/" },
        },
      ],
      scripts: [],
    },
    meta: {
      title: { value: "Hello", origin: { kind: "title" } },
      description: { value: "Yo", origin: { kind: "meta", name: "description" } },
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
  } as unknown as Page;
}

describe("<InspectView /> (async server component)", () => {
  it("renders the header card and the six tabs", async () => {
    const ui = await InspectView({ page: makePage() });
    render(ui);
    expect(screen.getByTestId("header-title")).toHaveTextContent("Hello");
    for (const tab of [
      "tab-previews",
      "tab-issues",
      "tab-raw",
      "tab-structured",
      "tab-i18n",
      "tab-assets",
    ]) {
      expect(screen.getByTestId(tab)).toBeInTheDocument();
    }
    // Default tab is "raw" — the highlighted title row should be in the DOM.
    expect(screen.getByTestId("raw-head-viewer")).toBeInTheDocument();
  });
});
