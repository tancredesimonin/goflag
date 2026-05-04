import type { Rule } from "./types";

const rule: Rule = {
  id: "title.missing",
  severity: "error",
  docs: {
    summary: "Every page needs a non-empty `<title>`",
    rationale: `The document title is the single most-quoted piece of metadata on the
web: it shows up in browser tabs, history, bookmarks, every search engine
result page, every link unfurl that doesn't have an \`og:title\`, and every
accessibility tool's window list. A missing or empty title forces every
consumer to invent one — typically by falling back to the URL path, which
is rarely useful.

Headlint treats this as an **error** because the cost of fixing it is one
line of HTML and the cost of not fixing it is felt on every surface a link
to the page ever lands on.`,
    exampleFix: {
      title: "Add a title element to <head>",
      language: "html",
      snippet: `<title>Page name — Site name</title>`,
    },
    references: [
      { label: "MDN: <title>", href: "https://developer.mozilla.org/docs/Web/HTML/Element/title" },
    ],
  },
  check: ({ page, issue }) => {
    const t = page.meta.title?.value?.trim();
    if (t && t.length > 0) return;
    return issue({
      message: "Page is missing a `<title>` element (or it is empty).",
      origin: { kind: "title" },
      fix: {
        title: "Add a <title> to <head>",
        snippet: `<title>Page name — Site name</title>`,
        language: "html",
      },
    });
  },
};

export default rule;
