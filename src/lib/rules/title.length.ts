import type { Rule } from "./types";

const MIN_LENGTH = 10;
const MAX_LENGTH = 60;

const rule: Rule = {
  id: "title.length",
  severity: "warning",
  docs: {
    summary: `Keep \`<title>\` between ${MIN_LENGTH} and ${MAX_LENGTH} characters`,
    rationale: `Search engines and OS tab strips both truncate titles. Google currently
shows roughly the first 50–60 characters on desktop SERPs (less on
mobile); Safari and Chrome cut tab labels around the same boundary. Below
~10 characters titles tend to be too generic to differentiate one page
from another, hurting CTR.

This rule fires for the very small set of titles outside the
${MIN_LENGTH}–${MAX_LENGTH} character window. It is intentionally a
**warning** rather than an error: a deliberately short brand-only title
("Stripe") or a long article headline can be the right call, but you
should know you're outside the safe range.`,
    exampleFix: {
      title: "Tighten the title to fit search results",
      language: "html",
      snippet: `<title>How we cut p99 latency by 40% — Engineering at Acme</title>`,
    },
  },
  check: ({ page, issue }) => {
    const t = page.meta.title?.value?.trim();
    if (!t) return;
    if (t.length >= MIN_LENGTH && t.length <= MAX_LENGTH) return;
    const direction = t.length < MIN_LENGTH ? "short" : "long";
    return issue({
      message: `Title is ${t.length} characters — ${direction} of the recommended ${MIN_LENGTH}–${MAX_LENGTH} window.`,
      origin: { kind: "title" },
    });
  },
};

export default rule;
