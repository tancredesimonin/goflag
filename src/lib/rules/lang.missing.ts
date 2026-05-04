import type { Rule } from "./types";

const rule: Rule = {
  id: "lang.missing",
  severity: "warning",
  docs: {
    summary: "Set a language on the `<html>` element",
    rationale: `Screen readers, browser translation prompts, hyphenation engines, and
search engines all key off the document language declared on
\`<html lang="...">\`. When it's missing, screen readers fall back to the
user's system language (often wrong, very confusing), and Chrome's
"translate this page" prompt either fires inappropriately or not at all.

The fix is one attribute, e.g. \`<html lang="en">\` or \`<html lang="fr-CA">\`,
following BCP-47.`,
    exampleFix: {
      title: "Declare the language on <html>",
      language: "html",
      snippet: `<html lang="en">`,
    },
  },
  check: ({ page, issue }) => {
    const lang = page.raw.htmlLang?.trim();
    if (lang && lang.length > 0) return;
    return issue({
      message: "`<html>` has no `lang` attribute.",
      origin: { kind: "html", attribute: "lang" },
    });
  },
};

export default rule;
