import type { Rule } from "./types";

const rule: Rule = {
  id: "canonical.absolute",
  severity: "error",
  docs: {
    summary: '`rel="canonical"` must be an absolute, fully-qualified URL',
    rationale: `Google explicitly requires absolute URLs in canonical declarations:
relative paths can be (and have been) misinterpreted, especially when the
page is reachable from multiple hosts (apex vs www, staging mirrors, edge
CDNs, AMP cache origins). The only safe form is the full
\`https://example.com/path\` URL — including the protocol.

This is an **error** because the consequence of getting it wrong is the
canonical signal silently being ignored, which is worse than not having
declared one at all.`,
    references: [
      {
        label: "Google: use absolute URLs",
        href: "https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls#use-absolute-paths",
      },
    ],
  },
  check: ({ page, issue }) => {
    const link = page.raw.links.find((l) => l.rel.toLowerCase() === "canonical");
    const raw = link?.href?.trim();
    if (!raw) return;
    if (/^https?:\/\//i.test(raw)) return;
    return issue({
      message: `Canonical is "${raw}" — must be an absolute http(s) URL (the parser resolved it to "${page.links.canonical ?? raw}", but consumers see the raw value).`,
      origin: { kind: "link", rel: "canonical" },
    });
  },
};

export default rule;
