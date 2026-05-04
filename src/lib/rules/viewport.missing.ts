import type { Rule } from "./types";

const rule: Rule = {
  id: "viewport.missing",
  severity: "warning",
  docs: {
    summary: 'Declare a `<meta name="viewport">` so mobile browsers render at the right scale',
    rationale: `Without a viewport meta, mobile browsers fall back to a desktop-width
virtual viewport (typically 980px) and zoom out to fit. Text becomes
illegible until the user pinches in, and Google's mobile-friendly
heuristic flags the page as not optimised for mobile, which feeds into
ranking.

The conventional value is
\`width=device-width, initial-scale=1\`. Anything stricter
(\`maximum-scale=1, user-scalable=no\`) breaks accessibility and is
flagged separately by axe / Lighthouse, but at minimum the tag must
exist.`,
    exampleFix: {
      title: "Add the viewport meta to <head>",
      language: "html",
      snippet: `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    },
  },
  check: ({ page, issue }) => {
    const v = page.meta.viewport?.value?.trim();
    if (v && v.length > 0) return;
    return issue({
      message:
        'Page has no `<meta name="viewport">` — mobile browsers will render at desktop width.',
      origin: { kind: "meta", name: "viewport" },
      fix: {
        title: "Add a viewport meta",
        snippet: `<meta name="viewport" content="width=device-width, initial-scale=1">`,
        language: "html",
      },
    });
  },
};

export default rule;
