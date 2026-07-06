/**
 * Rule registry — the SEO metadata checks Goflag ships.
 *
 * Deliberately small. Each rule is a pure `Page -> Issue[]` policy; the
 * runner (`../core/lint.ts`) iterates this list. These cover the metadata
 * mistakes that are (a) high-impact for search/social and (b) invisible to
 * a human eyeballing a page in a browser.
 *
 * i18n reciprocity ("missing translations") is intentionally NOT a lint
 * rule — it is a cross-page concern computed once in `../core/i18n.ts` and
 * surfaced in the report's `missingTranslations` section.
 */

import type { Rule, TagOrigin } from "./types";

const TITLE_MIN = 10;
const TITLE_MAX = 60;
const DESC_MIN = 50;
const DESC_MAX = 160;

function tokens(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

const titleMissing: Rule = {
  id: "title.missing",
  severity: "error",
  summary: "Every page needs a non-empty `<title>`",
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

const titleLength: Rule = {
  id: "title.length",
  severity: "warning",
  summary: `Keep \`<title>\` between ${TITLE_MIN} and ${TITLE_MAX} characters`,
  check: ({ page, issue }) => {
    const t = page.meta.title?.value?.trim();
    if (!t) return;
    if (t.length >= TITLE_MIN && t.length <= TITLE_MAX) return;
    const direction = t.length < TITLE_MIN ? "short" : "long";
    return issue({
      message: `Title is ${t.length} characters — ${direction} of the recommended ${TITLE_MIN}–${TITLE_MAX} window.`,
      origin: { kind: "title" },
    });
  },
};

const descriptionMissing: Rule = {
  id: "description.missing",
  severity: "warning",
  summary: 'Provide a `<meta name="description">` on every indexable page',
  check: ({ page, issue }) => {
    const d = page.meta.description?.value?.trim();
    if (d && d.length > 0) return;
    return issue({
      message: 'Page has no `<meta name="description">`.',
      origin: { kind: "meta", name: "description" },
      fix: {
        title: "Add a meta description",
        snippet: `<meta name="description" content="One sentence that promises what this page delivers.">`,
        language: "html",
      },
    });
  },
};

const descriptionLength: Rule = {
  id: "description.length",
  severity: "warning",
  summary: `Keep descriptions between ${DESC_MIN} and ${DESC_MAX} characters`,
  check: ({ page, issue }) => {
    const d = page.meta.description?.value?.trim();
    if (!d) return;
    if (d.length >= DESC_MIN && d.length <= DESC_MAX) return;
    const direction = d.length < DESC_MIN ? "short" : "long";
    return issue({
      message: `Description is ${d.length} characters — ${direction} of the recommended ${DESC_MIN}–${DESC_MAX} window.`,
      origin: { kind: "meta", name: "description" },
    });
  },
};

const canonicalMissing: Rule = {
  id: "canonical.missing",
  severity: "warning",
  summary: 'Declare a `<link rel="canonical">` so search engines pick the right URL',
  check: ({ page, issue }) => {
    if (page.links.canonical) return;
    return issue({
      message: 'Page is missing `<link rel="canonical">`.',
      origin: { kind: "link", rel: "canonical" },
      fix: {
        title: "Declare the canonical URL",
        snippet: `<link rel="canonical" href="https://example.com/the-page/">`,
        language: "html",
      },
    });
  },
};

const canonicalAbsolute: Rule = {
  id: "canonical.absolute",
  severity: "error",
  summary: '`rel="canonical"` must be an absolute, fully-qualified URL',
  check: ({ page, issue }) => {
    const link = page.raw.links.find((l) => l.rel.toLowerCase() === "canonical");
    const raw = link?.href?.trim();
    if (!raw) return;
    if (/^https?:\/\//i.test(raw)) return;
    return issue({
      message: `Canonical is "${raw}" — must be an absolute http(s) URL (consumers see the raw value, not the resolved "${page.links.canonical ?? raw}").`,
      origin: { kind: "link", rel: "canonical" },
    });
  },
};

const viewportMissing: Rule = {
  id: "viewport.missing",
  severity: "warning",
  summary: 'Declare a `<meta name="viewport">` so mobile browsers render at the right scale',
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

const ogTitleMissing: Rule = {
  id: "og.title.missing",
  severity: "warning",
  summary: "Set an explicit `og:title` instead of relying on `<title>` fallback",
  check: ({ page, issue }) => {
    if (page.openGraph.title?.value?.trim()) return;
    return issue({
      message: "Page has no `og:title`; consumers will fall back to `<title>` (or nothing).",
      origin: { kind: "meta", property: "og:title" },
    });
  },
};

const ogDescriptionMissing: Rule = {
  id: "og.description.missing",
  severity: "info",
  summary: "Set an explicit `og:description` for richer link unfurls",
  check: ({ page, issue }) => {
    if (page.openGraph.description?.value?.trim()) return;
    // Only worth flagging when the page bothered with any other OG tag.
    const hasOtherOg = Boolean(
      page.openGraph.title?.value || page.openGraph.images.length > 0 || page.openGraph.url?.value,
    );
    if (!hasOtherOg) return;
    return issue({
      message:
        "Page has `og:*` tags but no `og:description`; unfurls will fall back to the meta description (or nothing).",
      origin: { kind: "meta", property: "og:description" },
    });
  },
};

const ogImageMissing: Rule = {
  id: "og.image.missing",
  severity: "warning",
  summary: "Provide at least one `og:image` so links unfurl with a preview",
  check: ({ page, issue }) => {
    if (page.openGraph.images.length > 0) return;
    return issue({
      message:
        "Page has no `og:image`. Link unfurls will fall back to text-only or a random body image.",
      origin: { kind: "meta", property: "og:image" },
      fix: {
        title: "Add an og:image",
        snippet: `<meta property="og:image" content="https://example.com/og.png">`,
        language: "html",
      },
    });
  },
};

const robotsConflict: Rule = {
  id: "robots.conflict",
  severity: "error",
  summary: "`robots`, `googlebot`, and `X-Robots-Tag` must not contradict each other",
  check: ({ page, issue }) => {
    const issues = [];
    const metaRobots = new Set(tokens(page.meta.robots?.value));
    const metaGoogle = new Set(tokens(page.meta.googlebot?.value));
    const header = new Set(tokens(page.fetch.headers["x-robots-tag"]));

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

/** The full set of rules, alphabetised by id (stable output order). */
export const RULES: ReadonlyArray<Rule> = [
  canonicalAbsolute,
  canonicalMissing,
  descriptionLength,
  descriptionMissing,
  ogDescriptionMissing,
  ogImageMissing,
  ogTitleMissing,
  robotsConflict,
  titleLength,
  titleMissing,
  viewportMissing,
];

const RULE_BY_ID: Map<string, Rule> = new Map(RULES.map((r) => [r.id, r]));

export function getRule(id: string): Rule | undefined {
  return RULE_BY_ID.get(id);
}

export type { Rule, RuleContext } from "./types";
