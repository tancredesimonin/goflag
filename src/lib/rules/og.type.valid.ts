import type { Rule } from "./types";

const KNOWN_TYPES = new Set([
  "website",
  "article",
  "book",
  "profile",
  "music.song",
  "music.album",
  "music.playlist",
  "music.radio_station",
  "video.movie",
  "video.episode",
  "video.tv_show",
  "video.other",
  "product",
]);

const rule: Rule = {
  id: "og.type.valid",
  severity: "info",
  docs: {
    summary: "`og:type` should be one of the canonical Open Graph types",
    rationale: `The OG protocol defines a small enumerated list of canonical types
(\`website\`, \`article\`, \`profile\`, \`product\`, the \`music.*\` and
\`video.*\` families). Some unfurlers branch on this value to render
type-specific cards — Facebook, for example, will pull \`article:author\`
and \`article:published_time\` *only* when \`og:type\` is \`article\`.

Unknown values aren't fatal (most consumers fall back to \`website\`
behaviour) but they almost always indicate a typo or stale custom
namespace, so we surface them as **info**.`,
    references: [{ label: "Open Graph object types", href: "https://ogp.me/#types" }],
  },
  check: ({ page, issue }) => {
    const t = page.openGraph.type?.value?.trim();
    if (!t) return;
    if (KNOWN_TYPES.has(t)) return;
    return issue({
      message: `og:type "${t}" is not one of the canonical Open Graph types.`,
      origin: { kind: "meta", property: "og:type" },
    });
  },
};

export default rule;
