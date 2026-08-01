/**
 * Link extraction for the link checker.
 *
 * Unlike `extractCandidateLinks` in `src/lib/core/discover.ts` — which is
 * crawl-scoped (same-origin only, regex, `href` only) — the link checker
 * needs *all* links with reporting metadata. We parse with cheerio
 * (already a dependency) for accuracy.
 *
 * Default scope is `<a href>` only (matches the user's "all links"
 * intent). An `includeAssets` toggle widens the net to `<img src>`,
 * `<script src>`, `<link href>`, and `<iframe src>` so broken
 * images/assets surface too.
 *
 * Every URL is resolved against the page's (post-redirect) base URL,
 * then canonicalised with `canonicaliseUrl` (reused from `crawl.ts`,
 * which strips the fragment, preserves trailing slashes and rejects
 * `mailto:` / `tel:` / `javascript:`). Non-canonicalisable links (e.g.
 * `mailto:`) are still reported — with their `rawHref` — so the checker
 * can mark them `skipped` rather than silently dropping them.
 */

import * as cheerio from "cheerio";
import { canonicaliseUrl } from "../crawl";
import type { LinkKind, LinkRef, LinkSource } from "./types";

export interface ExtractLinksOptions {
  /** Base URL to resolve relative links against (the page's final URL). */
  baseUrl: string;
  /** Include `<img>/<script>/<link>/<iframe>` sources. Defaults to false. */
  includeAssets?: boolean;
}

interface ElementSpec {
  selector: string;
  attr: "href" | "src";
  source: LinkSource;
}

const ANCHOR_SPEC: ElementSpec = { selector: "a[href]", attr: "href", source: "a" };
const ASSET_SPECS: ElementSpec[] = [
  { selector: "img[src]", attr: "src", source: "img" },
  { selector: "script[src]", attr: "src", source: "script" },
  { selector: "link[href]", attr: "href", source: "link" },
  { selector: "iframe[src]", attr: "src", source: "iframe" },
];

/**
 * Parse `html` and return every link occurrence. Per-page de-duplication
 * is intentionally *not* done here (the orchestrator dedupes globally and
 * needs the per-page occurrences for the report); however identical
 * (url, source) pairs within a single page are collapsed to keep the
 * occurrence list tidy.
 */
export function extractLinks(html: string, options: ExtractLinksOptions): LinkRef[] {
  const $ = cheerio.load(html);
  // Relative links resolve against <base href> when present; "internal vs
  // external" is judged against the *audited* origin (the page URL).
  const base = resolveBase($, options.baseUrl);
  const origin = safeOrigin(options.baseUrl);
  const specs = options.includeAssets ? [ANCHOR_SPEC, ...ASSET_SPECS] : [ANCHOR_SPEC];

  const out: LinkRef[] = [];
  const seen = new Set<string>();

  for (const spec of specs) {
    $(spec.selector).each((_, el) => {
      const raw = $(el).attr(spec.attr);
      if (raw === undefined) return;
      const rawHref = raw.trim();
      if (!rawHref) return;

      const ref = buildRef($, el, rawHref, spec, base, origin);
      if (!ref) return;

      const dedupeKey = `${ref.source}|${ref.url}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      out.push(ref);
    });
  }

  return out;
}

function buildRef(
  $: cheerio.CheerioAPI,
  el: ReturnType<cheerio.CheerioAPI>[number],
  rawHref: string,
  spec: ElementSpec,
  base: string,
  origin: string | null,
): LinkRef | null {
  const fragment = extractFragment(rawHref);
  // Probe the URL as authored. Collapsing `/x/` to `/x` is a crawl-frontier
  // optimisation; here it would change the question from "does this link
  // work?" to "does a URL we invented work?".
  const canonical = canonicaliseUrl(rawHref, base, { preserveTrailingSlash: true });

  // Non-http(s) or otherwise un-canonicalisable links (mailto:, tel:,
  // javascript:, pure "#anchor"): keep them keyed by their raw form so
  // the checker can mark them `skipped` instead of dropping them.
  const url = canonical ?? rawHref;
  const kind: LinkKind = canonical ? classify(canonical, origin) : "external";

  const ref: LinkRef = {
    rawHref,
    url,
    kind,
    source: spec.source,
    rel: spec.source === "a" || spec.source === "link" ? parseRel($(el).attr("rel")) : [],
  };

  if (spec.source === "a") {
    const text = $(el).text().trim();
    if (text) ref.anchorText = text;
  }
  if (fragment) ref.fragment = fragment;

  return ref;
}

/** Pull the `#fragment` (with hash) off a raw href, ignoring bare anchors’ emptiness. */
function extractFragment(rawHref: string): string | undefined {
  const hash = rawHref.indexOf("#");
  if (hash === -1) return undefined;
  const frag = rawHref.slice(hash);
  return frag.length > 1 ? frag : undefined;
}

function parseRel(rel: string | undefined): string[] {
  if (!rel) return [];
  return rel
    .split(/\s+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

function classify(url: string, origin: string | null): LinkKind {
  if (!origin) return "external";
  return safeOrigin(url) === origin ? "internal" : "external";
}

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Resolve the effective base: prefer a `<base href>` in the document when
 * it resolves to an absolute URL, otherwise the supplied page URL.
 * Mirrors how browsers resolve relative links.
 */
function resolveBase($: cheerio.CheerioAPI, pageUrl: string): string {
  const declared = $("base[href]").first().attr("href")?.trim();
  if (declared) {
    try {
      return new URL(declared, pageUrl).toString();
    } catch {
      // Malformed <base href> — fall back to the page URL.
    }
  }
  return pageUrl;
}
