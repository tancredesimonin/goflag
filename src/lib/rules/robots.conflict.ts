import type { Rule, TagOrigin } from "./types";

function tokens(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

const rule: Rule = {
  id: "robots.conflict",
  severity: "error",
  docs: {
    summary: "`robots`, \`googlebot\`, and HTTP \`X-Robots-Tag\` must not contradict each other",
    rationale: `Indexing directives can be set in three places: \`<meta name="robots">\`,
\`<meta name="googlebot">\`, and the \`X-Robots-Tag\` HTTP header. When
they disagree (e.g. \`<meta name="robots" content="index">\` plus
\`X-Robots-Tag: noindex\`), Google takes the **strictest** interpretation
— so the page silently disappears from search even though the HTML
appears to allow indexing.

This is one of the most common reasons "but it's set to index!" debug
sessions go nowhere. We treat the conflict as an **error** because the
symptom (page not in the index) is invisible from the page itself.`,
    references: [
      {
        label: "Google: combining robots directives",
        href: "https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag#combining-meta-directives",
      },
    ],
  },
  check: ({ page, issue }) => {
    const issues = [];
    const metaRobots = new Set(tokens(page.meta.robots?.value));
    const metaGoogle = new Set(tokens(page.meta.googlebot?.value));
    const headerVal = page.fetch.headers["x-robots-tag"];
    const header = new Set(tokens(headerVal));

    const allSources: Array<{ name: string; tokens: Set<string>; origin: TagOrigin }> = [
      { name: "meta robots", tokens: metaRobots, origin: { kind: "meta", name: "robots" } },
      { name: "meta googlebot", tokens: metaGoogle, origin: { kind: "meta", name: "googlebot" } },
      {
        name: "X-Robots-Tag header",
        tokens: header,
        origin: { kind: "header", name: "x-robots-tag" },
      },
    ];
    const sources = allSources.filter((s) => s.tokens.size > 0);

    if (sources.length < 2) return [];

    const indexers = sources.filter((s) => s.tokens.has("index") && !s.tokens.has("noindex"));
    const noindexers = sources.filter((s) => s.tokens.has("noindex"));
    if (indexers.length > 0 && noindexers.length > 0) {
      issues.push(
        issue({
          message: `Conflicting indexing directives: ${noindexers.map((s) => s.name).join(", ")} say \`noindex\`, ${indexers.map((s) => s.name).join(", ")} say \`index\`.`,
          origin: noindexers[0]!.origin,
        }),
      );
    }

    const followers = sources.filter((s) => s.tokens.has("follow") && !s.tokens.has("nofollow"));
    const nofollowers = sources.filter((s) => s.tokens.has("nofollow"));
    if (followers.length > 0 && nofollowers.length > 0) {
      issues.push(
        issue({
          message: `Conflicting follow directives: ${nofollowers.map((s) => s.name).join(", ")} say \`nofollow\`, ${followers.map((s) => s.name).join(", ")} say \`follow\`.`,
          origin: nofollowers[0]!.origin,
        }),
      );
    }

    return issues;
  },
};

export default rule;
