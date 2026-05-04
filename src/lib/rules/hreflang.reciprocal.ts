import type { Rule } from "./types";

const rule: Rule = {
  id: "hreflang.reciprocal",
  severity: "info",
  docs: {
    summary: "Every `hreflang` alternate should also reference back to this page",
    rationale: `Google's hreflang implementation is strictly reciprocal: if page A
declares page B as an \`hreflang="fr"\` alternate, page B *must* declare
page A as an alternate too (typically with \`hreflang="en"\`). When the
loop is broken, Google ignores the entire hreflang cluster and ranks
each language independently — defeating the whole point of declaring
the alternates.

Headlint can't follow the links from one URL alone, so this rule fires
in a softer form: it warns when the **current page** does not include
itself in its own alternates list. Self-reference is the simplest part
of the reciprocity contract and a strong signal that the rest is
implemented correctly. Phase 8 (multi-page audits) will check the full
graph.`,
    references: [
      {
        label: "Google: hreflang reciprocity",
        href: "https://developers.google.com/search/docs/specialty/international/localized-versions#all-versions-must-confirm-each-other",
      },
    ],
  },
  check: ({ page, issue }) => {
    const alternates = page.links.alternates;
    if (alternates.length === 0) return;
    const canonical = page.links.canonical ?? page.fetch.finalUrl;
    if (!canonical) return;
    const referencesSelf = alternates.some((alt) => {
      try {
        return new URL(alt.href).href === new URL(canonical).href;
      } catch {
        return false;
      }
    });
    if (referencesSelf) return;
    return issue({
      message:
        "Page declares hreflang alternates but does not list itself among them — Google requires reciprocal references.",
      origin: { kind: "link", rel: "alternate" },
    });
  },
};

export default rule;
