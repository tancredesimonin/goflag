import { allDocs } from "content-collections";

import { INSTALL, LIB, PACKAGE, SITE } from "@/lib/constants";
import { docsHref, getDocsNav } from "@/lib/docs-nav";
import { ALL_RULES } from "@/lib/rules-catalog";
import { site } from "@/lib/seo/site";

/**
 * `llms.txt` — an index for whatever is reading this site without eyes.
 *
 * Generated from the same nav and the same rule catalogue the pages render, so
 * it cannot list a page that does not exist. Every documentation entry also
 * points at its markdown source under `/raw`.
 */
export const dynamic = "force-static";

export function GET() {
  const base = site.baseUrl;
  const lines: string[] = [];

  lines.push(`# ${SITE.name}`);
  lines.push("");
  lines.push(`> ${SITE.tagline}`);
  lines.push("");
  lines.push(
    `${PACKAGE.name} is a Node CLI that crawls a site by URL and reports four classes of defect: broken links, missing translation pages, a robots.txt that contradicts the pages it serves, and missing or misconfigured SEO metadata. The JSON report is the source of truth; the terminal output is a rendering of it. MIT licensed, Node ${PACKAGE.nodeRange}, no account and no telemetry.`,
  );
  lines.push("");
  lines.push(
    `${LIB.name} is the other half: a route registry for the Next.js App Router that produces what the CLI audits. A site declares its routes once, and the metadata, the hreflang cluster, the sitemap and robots.txt are derived from that one declaration rather than kept in agreement by hand. Build-time only, no runtime dependency.`,
  );
  lines.push("");
  lines.push(`Try it: \`${INSTALL.tryIt}\``);
  lines.push("");

  for (const group of getDocsNav()) {
    lines.push(`## ${group.title}`);
    lines.push("");
    for (const item of group.items) {
      const doc = allDocs.find((entry) => docsHref(entry.slug) === item.href);
      const raw = doc ? ` (markdown: ${base}/raw/docs/${doc.slug}.md)` : "";
      lines.push(`- [${item.title}](${base}${item.href}): ${item.description}${raw}`);
    }
    lines.push("");
  }

  lines.push("## Rules");
  lines.push("");
  for (const rule of ALL_RULES) {
    lines.push(
      `- [${rule.id}](${base}/docs/rules/${rule.id}): ${rule.severity}, ${rule.scope}-scoped. ${rule.summary.replace(/`/g, "")}`,
    );
  }
  lines.push("");

  lines.push("## Elsewhere");
  lines.push("");
  lines.push(
    `- [Changelog](${base}/en/changelog): every published version, generated from the commit history.`,
  );
  lines.push(`- [npm](${PACKAGE.npm}): ${PACKAGE.name}`);
  lines.push(`- [npm](${LIB.npm}): ${LIB.name}`);
  if (PACKAGE.repoPublic) lines.push(`- [Source](${PACKAGE.repo})`);
  lines.push("");

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
}
