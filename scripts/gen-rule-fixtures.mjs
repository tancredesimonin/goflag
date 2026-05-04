#!/usr/bin/env node
/**
 * Generates `fixtures/rules/<id>/{pass,fail}.html` for every Headlint rule.
 *
 * Each rule has a "base" HTML that satisfies *every* rule, and a small
 * patch that mutates the base into a fail-state for that one rule. The
 * pass.html is the base verbatim. Re-run after adding a new rule.
 *
 * The contract harness (`src/lib/rules/__tests__/contract.test.ts`)
 * loads the produced files and asserts the rule does/does not fire.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

/** Block of <head> children we treat as the canonical "everything is fine" page. */
const BASE_HEAD = `<meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Test page — Headlint fixtures</title>
  <meta name="description" content="A short paragraph designed to be over fifty characters and under one hundred sixty.">
  <link rel="canonical" href="https://example.com/page">
  <meta name="robots" content="index, follow">
  <meta property="og:title" content="Test page">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://example.com/page">
  <meta property="og:site_name" content="Example">
  <meta property="og:locale" content="en_US">
  <meta property="og:image" content="https://example.com/og.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="https://example.com/og.png">
  <meta name="twitter:image:alt" content="Example image alt text">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="icon" sizes="32x32" href="/favicon-32.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">`;

/** Render a full HTML doc from a list of <head> child snippets. */
function html(headChildren, { lang = "en" } = {}) {
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  ${headChildren}
</head>
<body><h1>Test page</h1></body>
</html>
`;
}

/** Drop every line whose payload (case-insensitive) contains a needle. */
function drop(head, needles) {
  const list = Array.isArray(needles) ? needles : [needles];
  return head
    .split("\n")
    .filter((line) => !list.some((n) => line.toLowerCase().includes(n.toLowerCase())))
    .join("\n");
}

/** Replace the first matching line with `replacement`. */
function replaceLine(head, needle, replacement) {
  return head
    .split("\n")
    .map((line) => (line.toLowerCase().includes(needle.toLowerCase()) ? `  ${replacement}` : line))
    .join("\n");
}

const PASS = html(BASE_HEAD);

const fails = {
  "title.missing": html(drop(BASE_HEAD, "<title>")),
  "title.length": html(replaceLine(BASE_HEAD, "<title>", "<title>Hi</title>")),
  "description.missing": html(drop(BASE_HEAD, 'name="description"')),
  "description.length": html(
    replaceLine(BASE_HEAD, 'name="description"', '<meta name="description" content="too short">'),
  ),
  "canonical.missing": html(drop(BASE_HEAD, 'rel="canonical"')),
  "canonical.absolute": html(
    replaceLine(BASE_HEAD, 'rel="canonical"', '<link rel="canonical" href="/page">'),
  ),
  "viewport.missing": html(drop(BASE_HEAD, 'name="viewport"')),
  "lang.missing": html(BASE_HEAD, { lang: "" }).replace('lang=""', ""),
  "og.image.missing": html(
    drop(BASE_HEAD, [
      'property="og:image"',
      'property="og:image:width"',
      'property="og:image:height"',
    ]),
  ),
  "og.image.absolute": html(
    replaceLine(BASE_HEAD, 'property="og:image"', '<meta property="og:image" content="/og.png">'),
  ),
  "og.title.missing": html(drop(BASE_HEAD, 'property="og:title"')),
  "og.image.dimensions": html(
    drop(BASE_HEAD, ['property="og:image:width"', 'property="og:image:height"']),
  ),
  "og.image.size": html(
    drop(BASE_HEAD, ['property="og:image:width"', 'property="og:image:height"']) +
      `\n  <meta property="og:image:width" content="100">\n  <meta property="og:image:height" content="100">`,
  ),
  "og.url.matches": html(
    replaceLine(
      BASE_HEAD,
      'property="og:url"',
      '<meta property="og:url" content="https://other.example.com/different">',
    ),
  ),
  "og.type.valid": html(
    replaceLine(
      BASE_HEAD,
      'property="og:type"',
      '<meta property="og:type" content="not-a-real-type">',
    ),
  ),
  "og.locale.valid": html(
    replaceLine(BASE_HEAD, 'property="og:locale"', '<meta property="og:locale" content="en-US">'),
  ),
  "og.siteName.missing": html(drop(BASE_HEAD, 'property="og:site_name"')),
  "twitter.card.missing": html(
    drop(BASE_HEAD, ['name="twitter:card"', 'name="twitter:image"', 'name="twitter:image:alt"']),
  ),
  "twitter.image.alt": html(drop(BASE_HEAD, 'name="twitter:image:alt"')),
  "twitter.card.matchesImage": html(
    drop(BASE_HEAD, [
      'property="og:image"',
      'property="og:image:width"',
      'property="og:image:height"',
      'name="twitter:image"',
      'name="twitter:image:alt"',
    ]),
  ),
  "hreflang.reciprocal": html(
    BASE_HEAD +
      `\n  <link rel="alternate" hreflang="fr" href="https://example.com/fr">\n  <link rel="alternate" hreflang="de" href="https://example.com/de">`,
  ),
  "hreflang.x-default": html(
    BASE_HEAD +
      `\n  <link rel="alternate" hreflang="en" href="https://example.com/page">\n  <link rel="alternate" hreflang="fr" href="https://example.com/fr">\n  <link rel="alternate" hreflang="de" href="https://example.com/de">`,
  ),
  "favicon.sizes": html(
    drop(BASE_HEAD, [
      'rel="icon" type="image/svg+xml"',
      'rel="icon" sizes="32x32"',
      'rel="apple-touch-icon"',
    ]),
  ),
  "manifest.missing": html(drop(BASE_HEAD, 'rel="manifest"')),
  "robots.conflict": html(
    replaceLine(BASE_HEAD, 'name="robots"', '<meta name="robots" content="noindex, nofollow">') +
      `\n  <meta name="googlebot" content="index, follow">`,
  ),
};

const ids = Object.keys(fails);
console.log(`Generating fixtures for ${ids.length} rules under fixtures/rules/`);

for (const id of ids) {
  const dir = resolve(root, "fixtures/rules", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "pass.html"), PASS, "utf8");
  writeFileSync(resolve(dir, "fail.html"), fails[id], "utf8");
}

console.log(`OK: wrote ${ids.length * 2} files.`);
