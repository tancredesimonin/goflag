/**
 * Framework-aware fix snippets (Phase 8.6).
 *
 * Rules emit a generic HTML `fix.snippet` so they remain framework-
 * agnostic. This module rewrites those snippets in-place when the
 * resolved config knows what framework the user is on — so a Next
 * project sees `metadata.openGraph.images` snippets instead of
 * `<meta property="og:image">`, an Astro project sees a
 * `<title>{title}</title>` slot, etc.
 *
 * The mapping is intentionally narrow at first. Adding a new
 * framework or rule is a single record entry; everything else stays
 * untouched.
 */

import type { Issue } from "@/lib/core/types";
import type { Framework } from "./types";

interface FrameworkSnippet {
  title: string;
  snippet: string;
  language: "ts" | "tsx" | "html" | "json";
}

type SnippetMap = Partial<Record<string, FrameworkSnippet>>;

const SNIPPETS: Partial<Record<Framework, SnippetMap>> = {
  next: {
    "og.image.missing": {
      title: "Declare openGraph.images in app/layout.tsx",
      language: "ts",
      snippet: `// app/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  openGraph: {
    images: [
      { url: "https://example.com/og.png", width: 1200, height: 630 },
    ],
  },
};`,
    },
    "title.missing": {
      title: "Set a Metadata title in app/layout.tsx",
      language: "ts",
      snippet: `// app/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My site",
};`,
    },
    "description.missing": {
      title: "Set Metadata.description in app/layout.tsx",
      language: "ts",
      snippet: `// app/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  description: "A short, evergreen description of this page.",
};`,
    },
  },
  astro: {
    "og.image.missing": {
      title: "Add og:image to your <Layout> component",
      language: "html",
      snippet: `<!-- src/layouts/Layout.astro -->
<head>
  <meta property="og:image" content="https://example.com/og.png" />
</head>`,
    },
  },
  nuxt: {
    "og.image.missing": {
      title: "Declare og:image via useSeoMeta",
      language: "ts",
      snippet: `// app.vue or any page
useSeoMeta({
  ogImage: "https://example.com/og.png",
});`,
    },
  },
};

export function applyFrameworkSnippets(
  issues: Issue[],
  framework: Framework | "auto" | undefined,
): Issue[] {
  if (!framework || framework === "unknown" || framework === "auto") return issues;
  const map = SNIPPETS[framework];
  if (!map) return issues;
  return issues.map((issue) => {
    const replacement = map[issue.ruleId];
    if (!replacement || !issue.fix) return issue;
    return { ...issue, fix: { ...replacement } };
  });
}
