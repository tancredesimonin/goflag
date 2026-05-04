import type { Rule } from "./types";

const MIN_LENGTH = 50;
const MAX_LENGTH = 160;

const rule: Rule = {
  id: "description.length",
  severity: "warning",
  docs: {
    summary: `Keep descriptions between ${MIN_LENGTH} and ${MAX_LENGTH} characters`,
    rationale: `Google truncates descriptions around 155–160 characters on desktop and
roughly 120 on mobile; X / Slack / Discord show the first ~200 in unfurls.
Below ~50 characters the snippet usually fails to make a value
proposition, so the consumer either pads it (search engines) or shows
something awkwardly short (link unfurls).

This rule complements \`description.missing\` by flagging the
descriptions that exist but are likely to be cut off mid-sentence or
read as filler.`,
  },
  check: ({ page, issue }) => {
    const d = page.meta.description?.value?.trim();
    if (!d) return;
    if (d.length >= MIN_LENGTH && d.length <= MAX_LENGTH) return;
    const direction = d.length < MIN_LENGTH ? "short" : "long";
    return issue({
      message: `Description is ${d.length} characters — ${direction} of the recommended ${MIN_LENGTH}–${MAX_LENGTH} window.`,
      origin: { kind: "meta", name: "description" },
    });
  },
};

export default rule;
