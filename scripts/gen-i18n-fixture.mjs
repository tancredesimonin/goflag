#!/usr/bin/env node
/**
 * Materialise the Phase 7 i18n-grid fixture from a single source of
 * truth (this file). Re-run after changing the structure so the
 * 12 HTML files stay in sync. The CI gate `verify:i18n-fixture`
 * re-runs the generator into a temp dir and diffs against the
 * committed copies, so drift fails the pipeline.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "fixtures/sites/i18n-grid");

const LOCALES = ["en", "fr", "de", "es"];
const ROUTES = [
  { id: "home", path: "" },
  { id: "blog", path: "/blog" },
  { id: "post", path: "/blog/post" },
];

/** Map from locale → which peers should be omitted (broken cluster). */
const BROKEN = {
  de: { post: ["fr"] }, // /de/blog/post forgets to advertise /fr/blog/post
};

function alternateLinks(currentLocale, route) {
  const tags = [];
  for (const locale of LOCALES) {
    if (BROKEN[currentLocale]?.[route.id]?.includes(locale)) continue;
    tags.push(`    <link rel="alternate" hreflang="${locale}" href="/${locale}${route.path}">`);
  }
  // x-default → English, kept for every page so the matrix has a stable column.
  tags.push(`    <link rel="alternate" hreflang="x-default" href="/en${route.path}">`);
  return tags.join("\n");
}

function navLinks(currentLocale) {
  // Same-locale internal nav so a `--depth 2` crawl from /<locale>/
  // discovers /<locale>/blog and /<locale>/blog/post via body anchors,
  // and a follow-hreflang pass discovers the cross-locale siblings.
  return ROUTES.map(
    (r) =>
      `      <a href="/${currentLocale}${r.path === "" ? "" : r.path}">${r.id.toUpperCase()}</a>`,
  ).join("\n");
}

function html(locale, route) {
  return `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8">
    <title>${route.id} — ${locale.toUpperCase()}</title>
    <link rel="canonical" href="/${locale}${route.path}">
${alternateLinks(locale, route)}
  </head>
  <body>
    <nav>
${navLinks(locale)}
    </nav>
    <h1>${route.id} (${locale})</h1>
  </body>
</html>
`;
}

function main() {
  for (const locale of LOCALES) {
    for (const route of ROUTES) {
      const dir = resolve(ROOT, locale + route.path);
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, "index.html"), html(locale, route), "utf8");
    }
  }
  // Top-level index — redirect-ish landing (just an HTML page so the
  // fixture server returns 200 from `/`).
  mkdirSync(ROOT, { recursive: true });
  writeFileSync(
    resolve(ROOT, "index.html"),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>i18n grid — root</title>
    <link rel="canonical" href="/">
${LOCALES.map((l) => `    <link rel="alternate" hreflang="${l}" href="/${l}">`).join("\n")}
    <link rel="alternate" hreflang="x-default" href="/en">
  </head>
  <body>
    <ul>
${LOCALES.map((l) => `      <li><a href="/${l}">${l.toUpperCase()}</a></li>`).join("\n")}
    </ul>
  </body>
</html>
`,
    "utf8",
  );
  console.log(`Generated ${LOCALES.length * ROUTES.length + 1} HTML files in ${ROOT}`);
}

main();
