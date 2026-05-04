import type { Rule } from "./types";

function normalise(input: string): string {
  try {
    const u = new URL(input);
    u.hash = "";
    let path = u.pathname.replace(/\/+$/, "");
    if (path === "") path = "/";
    return `${u.protocol}//${u.host}${path}${u.search}`;
  } catch {
    return input;
  }
}

const rule: Rule = {
  id: "og.url.matches",
  severity: "warning",
  docs: {
    summary: "`og:url` should match the canonical URL of the page",
    rationale: `\`og:url\` is the URL that link unfurlers attribute the share to and
that gets stored in social-graph databases. When it disagrees with
\`<link rel="canonical">\` you end up with the same content registered
under two different URLs across the social graph — split share counts
on Facebook, conflicting cache keys on Slack, two separate Pinterest
pins, etc.

The fix is to point \`og:url\` at the canonical URL. They should be
identical (modulo trailing slashes and the trailing fragment, which
this check ignores).`,
  },
  check: ({ page, issue }) => {
    const og = page.openGraph.url?.value?.trim();
    const canonical = page.links.canonical?.trim();
    if (!og || !canonical) return;
    if (normalise(og) === normalise(canonical)) return;
    return issue({
      message: `og:url ("${og}") doesn't match canonical ("${canonical}").`,
      origin: { kind: "meta", property: "og:url" },
    });
  },
};

export default rule;
