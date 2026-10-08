import { describe, expect, it } from "vitest";

import { looksLikeHtml, parseLlmsTxt } from "./parse";

const FILE = "https://x.com/llms.txt";

describe("parseLlmsTxt", () => {
  it("reads the proposal's own mock example", () => {
    // The example from https://llmstxt.org, verbatim but for real URLs.
    const parsed = parseLlmsTxt(
      [
        "# Title",
        "",
        "> Optional description goes here",
        "",
        "Optional details go here",
        "",
        "## Section name",
        "",
        "- [Link title](https://x.com/a.md): Optional link details",
        "",
        "## Optional",
        "",
        "- [Link title](https://x.com/b.md)",
      ].join("\n"),
      FILE,
    );

    expect(parsed.h1).toEqual({ text: "Title", line: 1 });
    expect(parsed.links).toEqual([
      { name: "Link title", url: "https://x.com/a.md", line: 9 },
      { name: "Link title", url: "https://x.com/b.md", line: 13 },
    ]);
  });

  it("finds no H1 where there is only an H2, or a `#` with no space", () => {
    expect(parseLlmsTxt("## Docs\n- [a](/a)", FILE).h1).toBeUndefined();
    expect(parseLlmsTxt("#Title", FILE).h1).toBeUndefined();
    expect(parseLlmsTxt("#", FILE).h1).toBeUndefined();
  });

  it("strips a byte-order mark, indentation and a closing sequence", () => {
    expect(parseLlmsTxt("\uFEFF   # Name #\n", FILE).h1).toEqual({ text: "Name", line: 1 });
    expect(parseLlmsTxt("# C# for agents", FILE).h1?.text).toBe("C# for agents");
  });

  it("keeps the first H1 when there are several", () => {
    expect(parseLlmsTxt("# One\n# Two", FILE).h1).toEqual({ text: "One", line: 1 });
  });

  it("resolves relative links against the file and drops fragments", () => {
    const parsed = parseLlmsTxt(
      '# N\n- [a](/raw/a.md#top)\n- [b](b.md)\n- [c](<https://y.com/c> "title")',
      "https://x.com/docs/llms.txt",
    );
    expect(parsed.links.map((link) => link.url)).toEqual([
      "https://x.com/raw/a.md",
      "https://x.com/docs/b.md",
      "https://y.com/c",
    ]);
  });

  it("skips images, inline code, fenced examples and destinations that are not URLs", () => {
    const parsed = parseLlmsTxt(
      [
        "# N",
        "![logo](/logo.png)",
        "Write `[name](url)` for each entry.",
        "```markdown",
        "# Not a title",
        "- [Example](https://example.com)",
        "```",
        "~~~",
        "- [Also not](https://example.org)",
        "~~~",
        "- [Mail](mailto:a@x.com)",
        "- [Real](https://x.com/real.md)",
      ].join("\n"),
      FILE,
    );
    expect(parsed.h1?.text).toBe("N");
    expect(parsed.links).toEqual([{ name: "Real", url: "https://x.com/real.md", line: 12 }]);
  });

  it("does not close a fence on a shorter or different run", () => {
    const parsed = parseLlmsTxt(
      ["````", "```", "- [Inside](https://x.com/in)", "~~~~", "````", "- [After](/after)"].join(
        "\n",
      ),
      FILE,
    );
    expect(parsed.links.map((link) => link.name)).toEqual(["After"]);
  });

  it("reports nothing it cannot resolve, rather than throwing", () => {
    expect(parseLlmsTxt("- [a](/a)", "not a url").links).toEqual([]);
  });
});

describe("looksLikeHtml", () => {
  it("recognises a document by its opening, whatever the header said", () => {
    expect(looksLikeHtml('<!DOCTYPE html><html lang="llms.txt">')).toBe(true);
    expect(looksLikeHtml("\uFEFF\n  <html>\n<head>")).toBe(true);
    expect(looksLikeHtml("<html lang=en>")).toBe(true);
  });

  it("does not mistake markdown that mentions HTML for a page", () => {
    expect(looksLikeHtml("# Site\n\n<html> is the root element.")).toBe(false);
    expect(looksLikeHtml("<htmlish>")).toBe(false);
    expect(looksLikeHtml("")).toBe(false);
  });
});
