import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SuggestionCard } from "./suggestion-card";
import type { Suggestion } from "@/lib/structured/types";

const SUGGESTION: Suggestion = {
  id: "Organization",
  type: "Organization",
  title: "Add an Organization block to credit your brand",
  rationale: "Search engines surface this in the brand panel.",
  severity: "info",
  example: {
    language: "json",
    snippet: `{\n  "@context": "https://schema.org",\n  "@type": "Organization",\n  "name": "Acme"\n}\n`,
  },
};

describe("<SuggestionCard />", () => {
  it("renders the title, type badge, rationale, and snippet", () => {
    render(
      <SuggestionCard
        suggestion={SUGGESTION}
        highlighted={`<pre><code>highlighted</code></pre>`}
      />,
    );
    expect(screen.getByText(SUGGESTION.title)).toBeInTheDocument();
    expect(screen.getByText("Organization")).toBeInTheDocument();
    expect(screen.getByText(/brand panel/)).toBeInTheDocument();
    expect(screen.getByTestId("suggestion-snippet")).toHaveTextContent("highlighted");
  });

  it("copies the raw snippet (not the highlighted HTML) to the clipboard on click", async () => {
    // userEvent.setup() installs its own clipboard mock on navigator;
    // we spy on the writeText method that mock exposes so the
    // assertion sees the real call coming from <SuggestionCard />.
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(<SuggestionCard suggestion={SUGGESTION} highlighted={`<pre><code>x</code></pre>`} />);
    await user.click(screen.getByTestId("suggestion-copy"));
    expect(writeText).toHaveBeenCalledWith(SUGGESTION.example.snippet);
    expect(await screen.findByText("Copied")).toBeInTheDocument();
    writeText.mockRestore();
  });

  it("does not crash when clipboard write rejects", async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockRejectedValue(new Error("denied"));
    render(<SuggestionCard suggestion={SUGGESTION} highlighted={`<pre><code>x</code></pre>`} />);
    await user.click(screen.getByTestId("suggestion-copy"));
    expect(writeText).toHaveBeenCalled();
    expect(screen.getByTestId("suggestion-card")).toBeInTheDocument();
    writeText.mockRestore();
  });
});
