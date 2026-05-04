import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { StructuredTab } from "./structured-tab";
import type { JsonLdBlock } from "@/lib/core/types";

function block(data: unknown, overrides: Partial<JsonLdBlock> = {}): JsonLdBlock {
  return {
    index: 0,
    raw: typeof data === "string" ? data : JSON.stringify(data),
    data,
    types:
      data && typeof data === "object" && "@type" in (data as Record<string, unknown>)
        ? [String((data as Record<string, unknown>)["@type"])]
        : [],
    ...overrides,
  };
}

describe("<StructuredTab />", () => {
  it("renders the empty state when there are no blocks", () => {
    render(<StructuredTab blocks={[]} />);
    expect(screen.getByText(/No JSON-LD blocks/i)).toBeInTheDocument();
  });

  it("renders one card per block, with type badges and a `valid` chip when clean", () => {
    render(
      <StructuredTab
        blocks={[
          block({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "Acme",
            url: "https://acme.com/",
            logo: "https://acme.com/logo.png",
            sameAs: ["https://twitter.com/acme"],
            contactPoint: { "@type": "ContactPoint", telephone: "+1" },
          }),
        ]}
      />,
    );
    const card = screen.getByTestId("json-ld-card");
    expect(within(card).getByText("Block #1")).toBeInTheDocument();
    expect(within(card).getByTestId("json-ld-clean")).toBeInTheDocument();
  });

  it("surfaces an error count when the block is missing required fields", () => {
    render(
      <StructuredTab
        blocks={[block({ "@context": "https://schema.org", "@type": "Article", headline: "Hi" })]}
      />,
    );
    expect(screen.getByTestId("json-ld-error-count")).toHaveTextContent(/error/);
  });

  it("renders parse errors instead of the tree when the block didn't parse", () => {
    render(
      <StructuredTab blocks={[block(null, { parseError: "Unexpected token", raw: "{ broken" })]} />,
    );
    expect(screen.getByText(/Parse error/i)).toBeInTheDocument();
  });
});
