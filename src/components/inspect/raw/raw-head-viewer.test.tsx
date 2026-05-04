import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RawHeadViewer, type AnnotatedHighlightedTag } from "./raw-head-viewer";

const tags: AnnotatedHighlightedTag[] = [
  {
    kind: "title",
    html: "<title>Example</title>",
    highlighted: '<pre class="shiki"><code>&lt;title&gt;Example&lt;/title&gt;</code></pre>',
    annotation: {
      label: "Document title",
      description: "First line of every Google SERP result.",
      consumers: ["Google SERP", "Slack"],
    },
  },
  {
    kind: "meta",
    html: '<meta name="description" content="An example" />',
    highlighted:
      '<pre class="shiki"><code>&lt;meta name=&quot;description&quot; content=&quot;An example&quot; /&gt;</code></pre>',
    annotation: { label: "Description", description: "Used by Google as the SERP snippet." },
  },
  {
    kind: "meta",
    html: '<meta property="og:image" content="x.png" />',
    highlighted:
      '<pre class="shiki"><code>&lt;meta property=&quot;og:image&quot; content=&quot;x.png&quot; /&gt;</code></pre>',
    annotation: { label: "OG image", description: "Thumbnail for social previews." },
  },
];

describe("<RawHeadViewer />", () => {
  it("renders a row per tag with the highlighted HTML", () => {
    render(<RawHeadViewer tags={tags} />);
    const rows = screen.getAllByTestId("raw-tag-row");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("<title>Example</title>");
  });

  it("filters rows by raw text and annotation label", () => {
    render(<RawHeadViewer tags={tags} />);
    fireEvent.change(screen.getByTestId("raw-filter"), { target: { value: "og:image" } });
    expect(screen.getAllByTestId("raw-tag-row")).toHaveLength(1);
    fireEvent.change(screen.getByTestId("raw-filter"), { target: { value: "description" } });
    expect(screen.getAllByTestId("raw-tag-row")).toHaveLength(1);
  });

  it("shows an empty-state message when nothing matches the filter", () => {
    render(<RawHeadViewer tags={tags} />);
    fireEvent.change(screen.getByTestId("raw-filter"), { target: { value: "xyz-no-match" } });
    expect(screen.queryAllByTestId("raw-tag-row")).toHaveLength(0);
    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument();
  });

  it("clears the filter when the X button is pressed", () => {
    render(<RawHeadViewer tags={tags} />);
    const input = screen.getByTestId("raw-filter") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "og:image" } });
    fireEvent.click(screen.getByLabelText("Clear filter"));
    expect(input.value).toBe("");
    expect(screen.getAllByTestId("raw-tag-row")).toHaveLength(3);
  });

  it("renders a tag count footer", () => {
    render(<RawHeadViewer tags={tags} />);
    expect(screen.getByText(/3 of 3 tags/i)).toBeInTheDocument();
  });
});
