/**
 * Page-type heuristics that drive the Phase 6 suggestion engine.
 *
 * The suggestion engine asks "does this page look like an article?
 * Like a contact page? Like a homepage?" before deciding which JSON-LD
 * template to recommend. We keep the heuristics deliberately
 * head-only — Goflag's deterministic snapshot doesn't store the
 * `<body>` parsed tree (yet), so any signal we use here has to be
 * derivable from `Page.fetch.finalUrl`, the parsed metadata, or the
 * raw `Page.html.static` string.
 *
 * Each heuristic returns a boolean. They're intentionally conservative
 * (over-recommending suggestions is annoying; under-recommending is
 * fine because the user can still opt-in by inspecting the page).
 */

import type { Page } from "@/lib/core/types";

export interface PageTypeHints {
  isHomepage: boolean;
  isArticle: boolean;
  isContact: boolean;
  isFaq: boolean;
  isPerson: boolean;
  isApp: boolean;
}

export function detectPageType(page: Page): PageTypeHints {
  const url = parseUrl(page.fetch.finalUrl) ?? parseUrl(page.fetch.requestedUrl);
  const path = url?.pathname ?? "/";
  const ogType = page.openGraph.type?.value?.toLowerCase();
  const title = page.meta.title?.value?.toLowerCase() ?? "";
  const html = page.html.static.toLowerCase();

  return {
    isHomepage: path === "/" || path === "",
    isArticle:
      ogType === "article" ||
      /\/blog\//.test(path) ||
      /\/news\//.test(path) ||
      /\/posts\//.test(path) ||
      /<article[\s>]/.test(html),
    isContact:
      /\/contact(?:[/-]|$)/.test(path) ||
      /\bcontact\b/.test(title) ||
      /<form[\s>][^]*?contact/.test(html),
    isFaq: /\/faq(?:[/-]|$)/.test(path) || /\bfaq|frequently asked/.test(title),
    isPerson:
      ogType === "profile" ||
      /\/about(?:[/-]|$)/.test(path) ||
      /\/team\//.test(path) ||
      /\/people\//.test(path),
    isApp:
      ogType === "product" ||
      ogType === "software" ||
      /\bapp store|google play|download (?:our|the) app\b/.test(title),
  };
}

function parseUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}
