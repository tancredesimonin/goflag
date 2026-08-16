/**
 * Cross-page rule registry — the hreflang policies goflag ships.
 *
 * These are the checks that a per-page `Rule` structurally cannot make, and
 * they are the ones that catch the failure modes we actually observed in the
 * wild:
 *
 *   - a site serving four locales with not a single `hreflang` tag anywhere
 *     (`hreflang.missing`), which the old crawl-derived matrix reported as
 *     "0 missing translations" because the absence of alternates is what made
 *     the other locales undiscoverable in the first place;
 *   - a `<head>` and a `sitemap.xml` that disagree about which locales a route
 *     exists in (`hreflang.sitemap-mismatch`) — two artefacts derived
 *     independently from the same intent, drifting apart silently.
 *
 * Both are gated on `localeAxis.multilingual`: on a single-locale site they
 * are noise, not findings.
 */

import { splitRoute } from "../core/i18n";
import { robotsAllows } from "../core/robots/match";
import type { SitemapDocument } from "../core/sitemap/types";
import type { Page, SitemapEntryProbe } from "../core/types";
import type { SiteContext, SiteRule } from "./site-types";

/** A site is only subject to hreflang policy when it serves 2+ locales. */
function isMultilingual(site: SiteContext): boolean {
  return site.localeAxis.multilingual;
}

/** Locale tags a page declares via `<link rel="alternate" hreflang>`, minus `x-default`. */
function declaredLocales(page: Page): Set<string> {
  const out = new Set<string>();
  for (const alt of page.links.alternates) {
    if (alt.isXDefault) continue;
    const tag = alt.hreflang?.trim().toLowerCase();
    if (tag) out.add(tag);
  }
  return out;
}

/**
 * The row a URL sits in: the cluster the site declared, when it declared one,
 * and the pathname-derived route otherwise.
 *
 * Both sides of `hreflang.sitemap-mismatch` have to agree on what "the same
 * route" means, and `splitRoute` alone answers with the path. On a site that
 * translates its slugs that is the wrong answer twice over: `/fr/tarifs`
 * yields route `/tarifs`, where the sitemap lists only `fr`, while its English
 * twin sits under `/pricing` — so a correct pair reads as two half-covered
 * routes and earns two warnings. Consulting the declared cluster first is the
 * same move `buildI18nMatrix` already makes (`../core/i18n.ts`); it only ever
 * moves a URL into a row, never invents one, so a site that declares no
 * cluster is byte-for-byte unaffected.
 */
function rowOf(site: SiteContext, url: string, pathname: string): string {
  return site.clusterRouteOf?.(url) ?? splitRoute(pathname).route;
}

/**
 * Route → locales the sitemap lists a URL for, counting only locales the site
 * actually serves.
 */
function sitemapLocalesByRoute(site: SiteContext): Map<string, Set<string>> {
  const byRoute = new Map<string, Set<string>>();
  const axis = new Set(site.localeAxis.locales.map((l) => l.toLowerCase()));
  for (const entry of site.discovery?.urls ?? []) {
    let pathname: string;
    try {
      pathname = new URL(entry.loc).pathname;
    } catch {
      continue;
    }
    const { locale } = splitRoute(pathname);
    if (locale === "x-default") continue;
    // The axis is what decides. `splitRoute` reads a segment by **shape
    // alone** — `bcp47.ts` says so in as many words, and `/de/` and `/api/`
    // are indistinguishable to it. `api`, `doc` and `www` all pass the
    // two-or-three-letter test, so a multilingual site with a `/doc/` section
    // was handing these rules a locale named `doc` and being told to publish
    // an `hreflang="doc"` alternate for it.
    if (!axis.has(locale.toLowerCase())) continue;
    const route = rowOf(site, entry.loc, pathname);
    const set = byRoute.get(route) ?? new Set<string>();
    set.add(locale.toLowerCase());
    byRoute.set(route, set);
  }
  return byRoute;
}

function sorted(set: Set<string>): string[] {
  return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * A multilingual site whose pages advertise no alternates at all.
 *
 * This is the headline blind spot. Google has no way to associate the locale
 * variants of a route, so they compete with each other instead of consolidating
 * — and the tool that was supposed to notice was itself relying on the missing
 * tags to know the locales existed.
 *
 * ## Why `vendor-spec`, and why two sources
 *
 * The obligation and the mechanism come from different documents, and the rule
 * cites both because an agent reading only one would draw the wrong conclusion.
 *
 * WHATWG defines the **mechanism** normatively: `rel="alternate"` with an
 * `hreflang` attribute designates a translation. What it does not do is require
 * anyone to emit one. No web standard says a multilingual site must declare its
 * alternates; that requirement belongs to Google alone, which is why the rule
 * claims `vendor-spec` and not `spec-required`, and why it stays silent on a
 * single-locale site where the obligation has no subject.
 *
 * Google's document is unambiguous about it, re-read 2026-08-15: *"Each language
 * version must list itself as well as all other language versions"*, and *"If two
 * pages don't both point to each other, the tags will be ignored."*
 *
 * ## Why `error` under a merely vendor-spec requirement
 *
 * Rigor and severity are different axes, and this rule is where the difference
 * shows. Rigor says how authoritative the requirement is — here, one vendor's.
 * Severity says how bad the consequence is, and the consequence is total: the
 * quoted sentence means a broken cluster is not degraded but **discarded**, so a
 * site that half-declares its alternates gets exactly what a site declaring none
 * gets. There is no partial credit to warn about.
 */
const hreflangMissing: SiteRule = {
  id: "hreflang.missing",
  severity: "error",
  summary: "Pages on a multilingual site must advertise their locale alternates",
  rigor: "vendor-spec",
  sources: ["google-hreflang", "whatwg-html-link-types"],
  appliesTo: isMultilingual,
  check: ({ site, issue }) => {
    const locales = site.localeAxis.locales.join(", ");
    return site.pages
      .filter((page) => page.links.alternates.length === 0)
      .map((page) =>
        issue({
          pageUrl: page.fetch.finalUrl,
          message:
            `Page declares no \`hreflang\` alternates, but the site serves ` +
            `${site.localeAxis.locales.length} locales (${locales}, per the ` +
            `${site.localeAxis.source}). Locale variants of this route cannot be ` +
            `associated with each other.`,
          origin: { kind: "link", rel: "alternate" },
          fix: {
            title: "Emit alternates from generateMetadata()",
            snippet: [
              "// app/[locale]/…/page.tsx",
              "export async function generateMetadata({ params }) {",
              "  const { locale } = await params;",
              "  return {",
              "    alternates: {",
              "      canonical: `${baseUrl}/${locale}${path}`,",
              "      languages: {",
              ...site.localeAxis.locales.map(
                (l) => `        "${l}": \`\${baseUrl}/${l}\${path}\`,`,
              ),
              '        "x-default": `${baseUrl}/${defaultLocale}${path}`,',
              "      },",
              "    },",
              "  };",
              "}",
            ].join("\n"),
            language: "tsx",
          },
        }),
      );
  },
};

/** One route's disagreement between what the `<head>` says and what the sitemap lists. */
interface CoverageGap {
  page: Page;
  route: string;
  /** Locales the sitemap lists that the `<head>` does not advertise. */
  onlyInSitemap: string[];
  /** Locales the `<head>` advertises that the sitemap does not list. */
  onlyInHead: string[];
}

/**
 * Walk both declarations once, for the two rules that read opposite halves of
 * the result.
 *
 * They were one rule until 2026-08-15 and are split because their claims have
 * different backing (see each below), not because they see different data. One
 * traversal keeps that true: `rowOf` decides what "the same route" means, and
 * two copies of this loop could answer differently on a site that translates
 * its slugs — which is the exact defect `site-rules.test.ts` was written for.
 *
 * Pages with no alternates at all are skipped: that is `hreflang.missing`'s
 * finding, and reporting it twice would double-count one defect.
 */
function coverageGaps(site: SiteContext): CoverageGap[] {
  const bySitemap = sitemapLocalesByRoute(site);
  const gaps: CoverageGap[] = [];

  for (const page of site.pages) {
    const head = declaredLocales(page);
    if (head.size === 0) continue;

    let pathname: string;
    try {
      pathname = new URL(page.fetch.finalUrl).pathname;
    } catch {
      continue;
    }
    const route = rowOf(site, page.fetch.finalUrl, pathname);
    const inSitemap = bySitemap.get(route);
    if (!inSitemap || inSitemap.size === 0) continue;

    gaps.push({
      page,
      route,
      onlyInSitemap: sorted(new Set([...inSitemap].filter((l) => !head.has(l)))),
      onlyInHead: sorted(new Set([...head].filter((l) => !inSitemap.has(l)))),
    });
  }

  return gaps;
}

/** Shared by both halves: they differ in what they claim, not in how to fix it. */
const ONE_SOURCE_FIX = {
  title: "Derive both from one locale-availability source",
  snippet: [
    "// Compute availability once, feed both the <head> and the sitemap.",
    "const localesFor = (slug: string) =>",
    "  allDocs.filter((d) => d.slug === slug && !d.draft).map((d) => d.locale);",
    "",
    "// generateMetadata(): alternates.languages ← localesFor(slug)",
    "// sitemap.ts:        alternates.languages ← localesFor(slug)",
  ].join("\n"),
  language: "ts",
} as const;

const bothApply = (site: SiteContext) =>
  isMultilingual(site) && (site.discovery?.urls.length ?? 0) > 0;

/**
 * The site publishes a translation its own `<head>` does not advertise.
 *
 * The sitemap listing `/fr/x` is the site asserting that the French version
 * exists and should be indexed. If `/en/x` then names no `fr` alternate, that
 * version sits outside the cluster: the two pages compete instead of
 * consolidating, which is the whole failure `hreflang` exists to prevent.
 *
 * ## Why this half is sourceable and the other is not
 *
 * Google requires the set to be complete — *"Each language version must list
 * itself as well as all other language versions"* — and the sitemap is the
 * site's own evidence that the omitted version is real. That chain is what makes
 * this `vendor-spec`: a cited requirement plus a fact the site supplied, not an
 * inference about what a site probably meant.
 *
 * ## The hidden link in that chain, and where it actually broke
 *
 * "The sitemap lists `/fr/x`" only means "a French version exists" if something
 * established that `/fr/x` is a locale variant at all. `splitRoute` answers that
 * by **shape alone** — `bcp47.ts` is explicit that `/de/` and `/api/` are
 * indistinguishable to it and that the locale axis is what decides — and
 * `sitemapLocalesByRoute` was not consulting the axis. `api`, `doc` and `www`
 * all pass its two-or-three-letter test, so a multilingual site with a `/doc/`
 * section produced a locale named `doc`, and this rule told its owner to
 * publish an `hreflang="doc"` alternate.
 *
 * That was the real defect behind the doubt this rule was raised under — not
 * the slug-translating case, where two paths simply form two rows and nothing
 * fires. The fix is in `sitemapLocalesByRoute`, one line, and it belongs there
 * rather than here: both halves read those rows, and only one of them was ever
 * going to be audited for it.
 *
 * `warning` and not `error`, unlike `hreflang.missing`: a partial cluster still
 * consolidates the versions it does list, so the damage is bounded to the ones
 * left out. There is no cluster at all in the `error` case.
 */
const hreflangClusterIncomplete: SiteRule = {
  id: "hreflang.cluster-incomplete",
  severity: "warning",
  summary: "Every locale the sitemap publishes must appear in the route's `hreflang` cluster",
  rigor: "vendor-spec",
  sources: ["google-hreflang"],
  appliesTo: bothApply,
  check: ({ site, issue }) =>
    coverageGaps(site)
      .filter((gap) => gap.onlyInSitemap.length > 0)
      .map(({ page, route, onlyInSitemap }) =>
        issue({
          pageUrl: page.fetch.finalUrl,
          message:
            `Route \`${route}\`: the sitemap lists ${onlyInSitemap.join(", ")} but the ` +
            `\`<head>\` does not advertise ${onlyInSitemap.length > 1 ? "them" : "it"}. ` +
            `The site publishes ${onlyInSitemap.length > 1 ? "those versions" : "that version"} ` +
            `and leaves ${onlyInSitemap.length > 1 ? "them" : "it"} outside the cluster, so ` +
            `${onlyInSitemap.length > 1 ? "they compete" : "it competes"} with this page instead ` +
            `of consolidating with it.`,
          origin: { kind: "link", rel: "alternate" },
          fix: ONE_SOURCE_FIX,
        }),
      ),
};

/**
 * The `<head>` advertises a translation the sitemap does not list.
 *
 * The other direction, kept separate because it is a weaker claim wearing the
 * same words. It is real drift — two code paths deriving one intent and
 * disagreeing — and it is worth surfacing, because a generator that disagrees
 * this way today can disagree the other way tomorrow, where it does cost
 * something.
 *
 * ## Deliberately `rigor: null`, and it survives the split
 *
 * Splitting was expected to source both halves. It sources one. **No document
 * supports this direction**, and that was checked rather than assumed on
 * 2026-08-15: Google presents the three declaration methods — HTML, HTTP
 * headers, sitemap — as *"equivalent from Google's perspective"*, actively
 * discourages combining them (*"there's no benefit in Search"*), and nowhere
 * requires an hreflang-declared page to appear in a sitemap. A page correctly
 * cross-linked and deliberately kept out of the sitemap is doing nothing wrong,
 * and this rule still says something about it.
 *
 * So it keeps the id it always had, and keeps an empty `rigor` — which is now a
 * verdict about the claim rather than a job nobody did. What it actually wants
 * to be is an **advisory**: evidence handed to an agent with no verdict attached,
 * exactly as `../advisory.ts` describes its own role. The blocker is that
 * advisories are page-scoped `ProseRule`s over an `Extraction`, and this needs
 * the sitemap and every page. One caller is thin justification for a
 * site-scoped advisory mechanism, in a repository that has logged six instances
 * of "written, tested, called by nobody". It moves when a second caller appears.
 */
const hreflangSitemapMismatch: SiteRule = {
  id: "hreflang.sitemap-mismatch",
  severity: "warning",
  summary: "`<head>` alternates advertise a locale the sitemap does not list",
  appliesTo: bothApply,
  check: ({ site, issue }) =>
    coverageGaps(site)
      .filter((gap) => gap.onlyInHead.length > 0)
      .map(({ page, route, onlyInHead }) =>
        issue({
          pageUrl: page.fetch.finalUrl,
          message:
            `Route \`${route}\`: the \`<head>\` advertises ${onlyInHead.join(", ")} but the ` +
            `sitemap has no entry for ${onlyInHead.length > 1 ? "them" : "it"}. Both are derived ` +
            `from the same intent, so the disagreement means one of the two generators is wrong ` +
            `— goflag cannot say which, and no specification requires a page to be in both.`,
          origin: { kind: "link", rel: "alternate" },
          fix: ONE_SOURCE_FIX,
        }),
      ),
};

/** Directive tokens from a page's `<meta name="robots">`. */
function metaRobotsTokens(page: Page): Set<string> {
  const raw = page.meta.robots?.value ?? "";
  return new Set(
    raw
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * `robots.txt` forbids the whole site.
 *
 * The most expensive misconfiguration a site can carry, and the one nothing
 * in the tool was watching: tancrede.eu served `User-agent: * / Disallow: /`
 * in production while every page carried `<meta name="robots"
 * content="index, follow">`. The pages ask to be indexed; the file forbids the
 * crawl that would read them — and because robots.txt wins, the request never
 * happens and the meta tag is never seen.
 *
 * Severity depends on whether anything contradicts the block. A staging site
 * that disallows everything and says nothing else is doing exactly what it
 * means to, so that is a warning. A site that blocks the crawl *and* asks to
 * be indexed cannot have meant both — that is an error.
 *
 * The gate now asks the RFC 9309 matcher whether `/` is allowed, rather than
 * looking for a literal `Disallow: /` line. Same answer on the file that
 * prompted the rule, and a correct one on the files that spell it otherwise —
 * `Disallow: *`, or a `Disallow: /` that an `Allow:` further down takes back.
 */
const robotsBlocksSite: SiteRule = {
  id: "robots.blocks-site",
  severity: "error",
  summary: "`robots.txt` must not forbid crawling a site that asks to be indexed",
  rigor: "vendor-spec",
  sources: ["ietf-rfc9309", "google-robots-intro"],
  appliesTo: (site) =>
    site.robots?.found === true && !robotsAllows(site.robots.groups, "/").allowed,
  check: ({ site, issue }) => {
    const robotsUrl = site.robots?.url ?? `${site.origin}/robots.txt`;

    // An explicit `index` is a statement of intent, not the mere absence of
    // `noindex` — which every page has by default and would make this fire
    // on every blocked staging environment.
    const asking = site.pages.filter((page) => metaRobotsTokens(page).has("index"));

    const detail = asking.length
      ? `but ${asking.length} crawled page${asking.length === 1 ? "" : "s"} declare ` +
        '`<meta name="robots" content="index">`. Both cannot be true: robots.txt ' +
        "wins, so the pages are never fetched and the meta tag is never read."
      : "so no search engine will crawl any page on this origin. If this is a " +
        "staging or preview environment, that is correct — otherwise the site is " +
        "invisible.";

    return issue({
      pageUrl: robotsUrl,
      severity: asking.length > 0 ? "error" : "warning",
      message: `\`robots.txt\` disallows the whole site for \`User-agent: *\`, ${detail}`,
      origin: { kind: "computed" },
      fix: {
        title: "Gate the disallow on the deployed environment",
        snippet: [
          "// app/robots.ts — the flag must be readable at build AND at runtime,",
          "// or a production container silently serves the staging rules.",
          'const isProduction = process.env.APP_ENV === "production";',
          "",
          "export default function robots(): MetadataRoute.Robots {",
          '  if (!isProduction) return { rules: { userAgent: "*", disallow: "/" } };',
          "  return {",
          '    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/_next/"] },',
          "    sitemap: `${baseUrl}/sitemap.xml`,",
          "  };",
          "}",
        ].join("\n"),
        language: "ts",
      },
    });
  },
};

/**
 * The fallback nobody declares and half the internet still requests.
 *
 * No specification requires `/favicon.ico`, which is why this is a guideline
 * and not a vendor-spec rule: modern browsers follow the `<link>` a page
 * declares and never touch the root. The clients that do are the naive ones —
 * feed readers, link unfurlers, crawlers written against 2005 — and they ask
 * the root blind, take what they get, and show nothing when it 404s.
 *
 * Site-level because the subject is one file at one path. Reported per page it
 * would be the same sentence five hundred times.
 */
const iconsIcoMissing: SiteRule = {
  id: "icons.ico.missing",
  severity: "info",
  summary: "Serve a `/favicon.ico` at the root for the clients that ask blind",
  rigor: "guideline",
  sources: ["whatwg-html-link-types", "mdn-link-rel"],
  // Only judged when the probe actually ran. No probe means goflag did not
  // look, and a rule that reported an absence it never checked for would be
  // inventing a finding.
  appliesTo: (site) => site.favicon !== undefined,
  check: ({ site, issue }) => {
    const probe = site.favicon;
    if (!probe || probe.found) return [];

    // Three distinguishable failures, and the remedy differs for each, so the
    // message says which one happened rather than "no favicon".
    const detail =
      probe.status === 0
        ? "the request failed outright"
        : probe.status >= 400
          ? `the origin answered ${probe.status}`
          : `the origin answered ${probe.status} with \`${probe.contentType ?? "no content type"}\`, which is not an image — a catch-all route serving the app shell looks exactly like this`;

    return issue({
      pageUrl: probe.url,
      message: `No \`/favicon.ico\` at the root: ${detail}. Clients that ask for it blind — feed readers, link unfurlers, older crawlers — get nothing.`,
      origin: { kind: "computed" },
      fix: {
        title: "Generate it from the icon you already have",
        snippet: [
          "// No framework convention emits an .ico: Next's icon.tsx goes through",
          "// ImageResponse, which is PNG. The container is a header plus one",
          "// entry per size plus the PNGs concatenated — thirty lines and no",
          "// dependency, over an image library you almost certainly already have.",
          "//",
          "// Fingerprint the *inputs* (the source image, the sizes), not the",
          "// bytes you produce: encoders are not stable across versions, so a",
          "// script keyed on its own output dirties the file on every commit.",
          "// Then a --check mode can verify it in CI without writing anything.",
        ].join("\n"),
        language: "ts",
      },
    });
  },
};

/**
 * The file-level robots.txt rules (`docs/sitemap-robots-plan.md` §4.1–4.2).
 *
 * They exist because the parse now keeps what it reads. Every one of them is a
 * few lines over a field `RobotsProbe` did not have a week ago, which is the
 * whole argument for having replaced two booleans with a model.
 *
 * The `robotstxt.*` prefix is deliberate and the plan settles it: the file and
 * the `<meta name="robots">` tag are different subjects, and `robots.conflict`
 * already belongs to the tag.
 */

/** RFC 9309 §2.4 — parsers need only honour the first 500 KiB. */
const ROBOTS_BYTE_LIMIT = 500 * 1024;

const robotstxtUnreachable: SiteRule = {
  id: "robotstxt.unreachable",
  severity: "error",
  summary: "A robots.txt that errors is read as forbidding the whole site",
  rigor: "spec-required",
  sources: ["ietf-rfc9309"],
  // A 404 is not a failure: §2.3.1.3 says an absent file allows everything,
  // and most sites that have none mean exactly that. Only a server that
  // answered badly, or did not answer, triggers the disallow-everything rule.
  appliesTo: (site) => site.robots !== undefined && isRobotsFailure(site.robots.status),
  check: ({ site, issue }) => {
    const probe = site.robots!;
    const detail =
      probe.status === 0 ? "the request failed" : `the origin answered ${probe.status}`;

    return issue({
      pageUrl: probe.url,
      message: `\`robots.txt\` could not be read: ${detail}. RFC 9309 §2.3.1.4 tells a crawler to assume a complete disallow for as long as this lasts — an outage on this one file takes the whole site out of the index.`,
      origin: { kind: "computed" },
    });
  },
};

const robotstxtOversized: SiteRule = {
  id: "robotstxt.oversized",
  severity: "error",
  summary: "Rules past 500 KiB of robots.txt are not guaranteed to be read",
  rigor: "spec-required",
  sources: ["ietf-rfc9309"],
  appliesTo: (site) => (site.robots?.byteLength ?? 0) > ROBOTS_BYTE_LIMIT,
  check: ({ site, issue }) => {
    const probe = site.robots!;
    const kib = Math.round(probe.byteLength / 1024);

    return issue({
      pageUrl: probe.url,
      message: `\`robots.txt\` is ${kib} KiB. A parser is only required to honour the first 500 KiB (RFC 9309 §2.4), so every rule past that point silently does not exist.`,
      origin: { kind: "computed" },
    });
  },
};

const robotstxtInvalidLine: SiteRule = {
  id: "robotstxt.invalid-line",
  severity: "warning",
  summary: "Every line of robots.txt should parse as something",
  rigor: "spec-required",
  sources: ["ietf-rfc9309"],
  appliesTo: (site) => (site.robots?.invalidLines.length ?? 0) > 0,
  check: ({ site, issue }) => {
    const probe = site.robots!;
    // One finding per file, not per line: a file with a hundred junk lines has
    // one defect, and the summary lesson says forty repeats of it are noise.
    const shown = probe.invalidLines.slice(0, 5);
    const rest = probe.invalidLines.length - shown.length;

    return issue({
      pageUrl: probe.url,
      message:
        `\`robots.txt\` has ${probe.invalidLines.length} line${probe.invalidLines.length === 1 ? "" : "s"} that parse as nothing: ` +
        shown.map((l) => `line ${l.line} (${l.reason})`).join(", ") +
        `${rest > 0 ? `, and ${rest} more` : ""}. A crawler drops them silently, so the rule you meant to write is simply absent.`,
      origin: { kind: "computed" },
    });
  },
};

const robotstxtUnknownDirective: SiteRule = {
  id: "robotstxt.unknown-directive",
  severity: "info",
  summary: "Non-standard robots.txt directives are read by some crawlers and ignored by others",
  rigor: "guideline",
  sources: ["ietf-rfc9309", "google-robots-intro"],
  appliesTo: (site) => (site.robots?.unknownDirectives.length ?? 0) > 0,
  check: ({ site, issue }) => {
    const probe = site.robots!;
    const names = [...new Set(probe.unknownDirectives.map((d) => d.name))];

    // Deliberately not a defect. These parse, they are spelled correctly, and
    // some crawlers honour them — the finding exists so nobody counts on the
    // ones that do not.
    return issue({
      pageUrl: probe.url,
      message: `\`robots.txt\` uses ${names.map((n) => `\`${n}\``).join(", ")}, which RFC 9309 does not define. Some crawlers honour ${names.length === 1 ? "it" : "them"} and Google ignores ${names.length === 1 ? "it" : "them"} — so this is worth knowing, not necessarily worth changing.`,
      origin: { kind: "computed" },
    });
  },
};

const robotstxtCrossOrigin: SiteRule = {
  id: "robotstxt.cross-origin",
  severity: "warning",
  summary: "`/robots.txt` should not redirect to another origin",
  rigor: "vendor-spec",
  sources: ["ietf-rfc9309"],
  appliesTo: (site) => site.robots?.redirects.crossOrigin === true,
  check: ({ site, issue }) => {
    const probe = site.robots!;

    return issue({
      pageUrl: probe.url,
      message: `\`robots.txt\` redirects to \`${probe.redirects.finalUrl}\`, on another origin. RFC 9309 §2.3.1.2 permits following it, so this works — but the policy for this site now lives somewhere this site does not control, and it is usually a proxy accident rather than a decision.`,
      origin: { kind: "computed" },
    });
  },
};

const robotstxtSitemapRelative: SiteRule = {
  id: "robotstxt.sitemap.relative",
  severity: "error",
  summary: "A `Sitemap:` declaration must be an absolute URL",
  rigor: "spec-required",
  sources: ["sitemaps-protocol", "ietf-rfc9309"],
  appliesTo: (site) => (site.robots?.sitemaps ?? []).some((s) => !isAbsolute(s.value)),
  check: ({ site, issue }) => {
    const probe = site.robots!;
    const relative = probe.sitemaps.filter((s) => !isAbsolute(s.value));

    return issue({
      pageUrl: probe.url,
      message: `\`Sitemap:\` must be a full URL: ${relative.map((s) => `line ${s.line} declares \`${s.value}\``).join(", ")}. robots.txt is fetched on its own, so there is no page for a consumer to resolve a relative path against.`,
      origin: { kind: "computed" },
    });
  },
};

/**
 * A crawled page that asks to be indexed sits behind a `Disallow`.
 *
 * The generalisation of `robots.blocks-site` past `Disallow: /`, and the rule
 * the RFC 9309 matcher was written for. The site-wide case is the loud one;
 * this is the quiet one — a single path rule, added for a reason that made
 * sense once, still shadowing a section of the site that has since been given
 * pages that ask to be found.
 *
 * `robots.blocks-site` takes precedence: when the whole origin is disallowed,
 * every page is blocked and saying so once is the finding.
 */
const robotsBlocksPage: SiteRule = {
  id: "robots.blocks-page",
  severity: "error",
  summary: "A page asking to be indexed must not be disallowed by robots.txt",
  rigor: "vendor-spec",
  sources: ["ietf-rfc9309", "google-robots-intro"],
  appliesTo: (site) => site.robots?.found === true && robotsAllows(site.robots.groups, "/").allowed,
  check: ({ site, issue }) => {
    const probe = site.robots!;

    return site.pages.flatMap((page) => {
      if (!metaRobotsTokens(page).has("index")) return [];

      let path: string;
      try {
        const url = new URL(page.fetch.finalUrl);
        path = `${url.pathname}${url.search}`;
      } catch {
        return [];
      }

      const decision = robotsAllows(probe.groups, path);
      if (decision.allowed || !decision.rule) return [];

      return issue({
        pageUrl: page.fetch.finalUrl,
        message: `Page declares \`<meta name="robots" content="index">\` but \`robots.txt\` line ${decision.rule.line} disallows \`${decision.rule.pattern}\` for \`${decision.group}\`. robots.txt wins: the page is never fetched, so the tag asking for it is never read.`,
        origin: { kind: "computed" },
      });
    });
  },
};

/**
 * The sitemap rules (`docs/sitemap-robots-plan.md` §4.3–4.4).
 *
 * Every one of them replaces a field of `SitemapDiagnostics` that was declared
 * and never written — `mixedHost`, `mixedProtocol`, `lastmodIssues`. The plan
 * says why they belonged in rules rather than in a diagnostics bag: a number
 * on a report tells you something is wrong somewhere, and a finding tells you
 * which entry, in which document, and what the specification says about it.
 *
 * Three rules from those sections are deliberately absent, because the model
 * cannot answer them honestly yet. `sitemap.limits.exceeded` counts entries
 * **per document** and today's `urlCount` is a total across all of them;
 * `sitemap.index.nested` needs to know a child was itself an index;
 * `sitemap.entry.out-of-scope` needs to know which document declared each
 * entry. All three arrive with the document tree, and shipping them now would
 * mean rules that quietly only work on a site with one flat sitemap.
 */

/** `<changefreq>` values the protocol defines. Anything else is not one. */
const CHANGEFREQ = new Set(["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"]);

/** How many offending entries a finding names before it starts counting. */
const SAMPLE = 5;

/** `n` entries, listing the first few — forty repeats of one defect is noise. */
function sample(locs: string[]): string {
  const shown = locs.slice(0, SAMPLE);
  const rest = locs.length - shown.length;
  return `${shown.map((l) => `\`${l}\``).join(", ")}${rest > 0 ? `, and ${rest} more` : ""}`;
}

const sitemapMissing: SiteRule = {
  id: "sitemap.missing",
  severity: "warning",
  summary: "A site should publish a sitemap",
  rigor: "guideline",
  sources: ["sitemaps-protocol", "google-sitemaps"],
  // A warning rather than an error, and the plan settles it: a small, fully
  // linked site genuinely may not need one. Google's own guidance says
  // "usually worth having", which is exactly a guideline.
  appliesTo: (site) => site.discovery !== undefined && !site.discovery.diagnostics.found,
  check: ({ site, issue }) =>
    issue({
      pageUrl: `${site.origin}/sitemap.xml`,
      message:
        "No sitemap was found — not declared in `robots.txt`, and not at a well-known path. " +
        "Discovery then depends entirely on what links to what, which is the part of a site nobody audits.",
      origin: { kind: "computed" },
    }),
};

const sitemapUnparsable: SiteRule = {
  id: "sitemap.unparsable",
  severity: "error",
  summary: "A located sitemap must be a well-formed `<urlset>` or `<sitemapindex>`",
  rigor: "spec-required",
  sources: ["sitemaps-protocol"],
  appliesTo: (site) =>
    site.discovery?.diagnostics.found === true && !site.discovery.diagnostics.wellFormed,
  check: ({ site, issue }) => {
    const diagnostics = site.discovery!.diagnostics;
    return issue({
      pageUrl: diagnostics.sitemapUrl ?? `${site.origin}/sitemap.xml`,
      message:
        "A sitemap was served but does not parse as XML. The usual cause is an HTML error page " +
        "answered with a 200 — which reads as a healthy sitemap to anything that only checks the status.",
      origin: { kind: "computed" },
    });
  },
};

const sitemapEmpty: SiteRule = {
  id: "sitemap.empty",
  severity: "warning",
  summary: "A sitemap that parses should list something",
  rigor: "guideline",
  sources: ["sitemaps-protocol"],
  // Only when the crawl found pages: an empty sitemap on a site with no pages
  // is consistent, and saying otherwise would be noise.
  appliesTo: (site) =>
    site.discovery?.diagnostics.wellFormed === true &&
    site.discovery.urls.length === 0 &&
    site.pages.length > 0,
  check: ({ site, issue }) => {
    const diagnostics = site.discovery!.diagnostics;
    return issue({
      pageUrl: diagnostics.sitemapUrl ?? `${site.origin}/sitemap.xml`,
      message: `The sitemap parses and lists no URLs, while the crawl found ${site.pages.length}. goflag falls back to crawling — a consumer that trusts the sitemap has nothing to read.`,
      origin: { kind: "computed" },
    });
  },
};

const sitemapIndexChildError: SiteRule = {
  id: "sitemap.index.child-error",
  severity: "error",
  summary: "Every child of a sitemap index must be reachable and parseable",
  rigor: "spec-required",
  sources: ["sitemaps-protocol"],
  appliesTo: (site) => (site.discovery?.diagnostics.childSitemapErrors ?? 0) > 0,
  check: ({ site, issue }) => {
    const diagnostics = site.discovery!.diagnostics;
    const total = diagnostics.childSitemapCount;

    return issue({
      pageUrl: diagnostics.sitemapUrl ?? `${site.origin}/sitemap.xml`,
      message: `${diagnostics.childSitemapErrors} of ${total} child sitemaps could not be read. The index declares an inventory and part of it is missing, so whatever those documents listed is invisible — and nothing says how much that is.`,
      origin: { kind: "computed" },
    });
  },
};

const sitemapEntryInvalidUrl: SiteRule = {
  id: "sitemap.entry.invalid-url",
  severity: "error",
  summary: "Every `<loc>` must be an absolute, parseable URL",
  rigor: "spec-required",
  sources: ["sitemaps-protocol"],
  appliesTo: (site) => (site.discovery?.urls ?? []).some((entry) => !isAbsolute(entry.loc)),
  check: ({ site, issue }) => {
    const bad = site.discovery!.urls.filter((entry) => !isAbsolute(entry.loc));
    return issue({
      pageUrl: site.discovery!.diagnostics.sitemapUrl ?? `${site.origin}/sitemap.xml`,
      message: `${bad.length} \`<loc>\` value${bad.length === 1 ? " is" : "s are"} not an absolute URL: ${sample(bad.map((e) => e.loc))}. A sitemap is fetched on its own, so a consumer has nothing to resolve them against.`,
      origin: { kind: "computed" },
    });
  },
};

/**
 * The two ceilings sitemaps.org puts on a single document, verbatim:
 *
 * > each Sitemap file that you provide must have no more than 50,000 URLs and
 * > must be no larger than 50MB (52,428,800 bytes)
 *
 * and, for an index:
 *
 * > Sitemap index files may not list more than 50,000 Sitemaps and must be no
 * > larger than 50MB (52,428,800 bytes)
 *
 * Same two numbers either way, counted over a different thing — which is why
 * this is one rule rather than two, and why it needs the document tree: both
 * are stated **per document**, and a site-wide total answers neither.
 */
const DOCUMENT_URL_LIMIT = 50_000;
const DOCUMENT_BYTE_LIMIT = 52_428_800;

/** What a given document declares, counted the way its own ceiling is written. */
function declaredCount(doc: SitemapDocument): number {
  return doc.kind === "index" ? doc.childLocs.length : doc.urlCount;
}

function oversizedDocuments(site: SiteContext): SitemapDocument[] {
  return (site.discovery?.documents ?? []).filter(
    (doc) =>
      doc.kind !== "unparsable" &&
      (declaredCount(doc) > DOCUMENT_URL_LIMIT || doc.byteLength > DOCUMENT_BYTE_LIMIT),
  );
}

/**
 * A sitemap document is over one of the protocol's two ceilings.
 *
 * Not a style point: a consumer is entitled to stop reading at the limit, so
 * everything past it is dead weight that looks published and is not. The
 * failure is silent from every angle — the file serves, it parses, and the
 * entries beyond the cut simply never get crawled.
 *
 * Measured on the **uncompressed** body, because the ceiling is about what a
 * consumer must parse rather than what crossed the wire. A gzipped document is
 * over the limit at the same size a plain one is.
 */
const sitemapLimitsExceeded: SiteRule = {
  id: "sitemap.limits.exceeded",
  severity: "error",
  summary: "No single sitemap document may exceed 50,000 entries or 50 MB",
  rigor: "spec-required",
  sources: ["sitemaps-protocol"],
  appliesTo: (site) => oversizedDocuments(site).length > 0,
  check: ({ site, issue }) =>
    oversizedDocuments(site).map((doc) => {
      const count = declaredCount(doc);
      const noun = doc.kind === "index" ? "child sitemaps" : "URLs";
      const over: string[] = [];
      if (count > DOCUMENT_URL_LIMIT) {
        over.push(`${count.toLocaleString("en-US")} ${noun} against a ceiling of 50,000`);
      }
      if (doc.byteLength > DOCUMENT_BYTE_LIMIT) {
        over.push(
          `${(doc.byteLength / 1_048_576).toFixed(1)} MB uncompressed against a ceiling of 50 MB`,
        );
      }

      return issue({
        pageUrl: doc.url,
        message: `This sitemap document declares ${over.join(" and ")}. A consumer may stop reading at the limit, so everything past it is published in name only — split the document and reference the parts from an index.`,
        origin: { kind: "computed" },
      });
    }),
};

/**
 * A sitemap lists URLs outside the directory it is served from.
 *
 * sitemaps.org scopes a document's authority by its own location, with an
 * example rather than a rule of thumb:
 *
 * > A Sitemap file located at http://example.com/catalog/sitemap.xml can
 * > include any URLs starting with http://example.com/catalog/ but can not
 * > include URLs starting with http://example.com/images/
 *
 * A root-level sitemap is exempt by construction: its directory is `/`, so
 * every path on the host is under it. That is most sitemaps, which is why this
 * rule is quiet on every site in this repository and still worth having — the
 * sites it catches are the ones that split sitemaps per section and serve them
 * from those sections.
 *
 * Entries on another host are skipped rather than counted twice:
 * `sitemap.entry.cross-host` is the finding for those, and reporting one URL
 * under two rules teaches a reader to discount both.
 */
function outOfScopeEntries(site: SiteContext): { loc: string; from: string }[] {
  const out: { loc: string; from: string }[] = [];

  for (const entry of site.discovery?.urls ?? []) {
    if (!entry.documentUrl) continue;

    let scope: URL;
    let loc: URL;
    try {
      scope = new URL(entry.documentUrl);
      loc = new URL(entry.loc);
    } catch {
      continue;
    }

    // Everything up to and including the last `/` — the directory the document
    // is served from.
    const prefix = scope.pathname.replace(/[^/]*$/, "");
    if (prefix === "/") continue;
    if (loc.origin !== scope.origin) continue;
    if (loc.pathname.startsWith(prefix)) continue;

    out.push({ loc: entry.loc, from: entry.documentUrl });
  }

  return out;
}

const sitemapEntryOutOfScope: SiteRule = {
  id: "sitemap.entry.out-of-scope",
  severity: "error",
  summary: "A sitemap may only list URLs under its own directory",
  rigor: "spec-required",
  sources: ["sitemaps-protocol"],
  appliesTo: (site) => outOfScopeEntries(site).length > 0,
  check: ({ site, issue }) => {
    const bad = outOfScopeEntries(site);
    // Grouped by the document that overreached: the fix is per document — move
    // the entries, or move the sitemap to the root — and one finding per stray
    // URL would bury that under repetition.
    const byDocument = new Map<string, string[]>();
    for (const { loc, from } of bad) {
      byDocument.set(from, [...(byDocument.get(from) ?? []), loc]);
    }

    return [...byDocument].map(([from, locs]) =>
      issue({
        pageUrl: from,
        message: `${locs.length} entr${locs.length === 1 ? "y is" : "ies are"} outside this sitemap's directory \`${new URL(from).pathname.replace(/[^/]*$/, "")}\`: ${sample(locs)}. A sitemap only speaks for the path it is served from, so a consumer may drop ${locs.length === 1 ? "it" : "them"} — serve the document from the root, or move the entries into a sitemap that covers them.`,
        origin: { kind: "computed" },
      }),
    );
  },
};

const sitemapEntryCrossHost: SiteRule = {
  id: "sitemap.entry.cross-host",
  severity: "error",
  summary: "A sitemap should only list URLs on its own host",
  rigor: "spec-required",
  sources: ["sitemaps-protocol"],
  // `www` and the apex are different hosts to a consumer, which is the case
  // this actually catches: a sitemap generated against one and served on the
  // other. The cross-submission escape hatch needs the other host's robots.txt
  // and arrives with the cross-artefact rules.
  appliesTo: (site) => crossHostEntries(site).length > 0,
  check: ({ site, issue }) => {
    const bad = crossHostEntries(site);
    return issue({
      pageUrl: site.discovery!.diagnostics.sitemapUrl ?? `${site.origin}/sitemap.xml`,
      message: `${bad.length} entr${bad.length === 1 ? "y names a host" : "ies name hosts"} other than this sitemap's: ${sample(bad)}. A consumer may drop them — the sitemap only speaks for the host that serves it.`,
      origin: { kind: "computed" },
    });
  },
};

const sitemapEntryProtocolMismatch: SiteRule = {
  id: "sitemap.entry.protocol-mismatch",
  severity: "warning",
  summary: "A sitemap should not mix `http` and `https` entries",
  rigor: "spec-required",
  sources: ["sitemaps-protocol"],
  appliesTo: (site) => protocolsIn(site).size > 1,
  check: ({ site, issue }) => {
    const protocols = [...protocolsIn(site)].sort();
    return issue({
      pageUrl: site.discovery!.diagnostics.sitemapUrl ?? `${site.origin}/sitemap.xml`,
      message: `The sitemap lists both ${protocols.join(" and ")} URLs. One of the two sets names pages the site does not serve at those addresses, and a consumer has no way to tell which.`,
      origin: { kind: "computed" },
    });
  },
};

const sitemapLastmodInvalid: SiteRule = {
  id: "sitemap.lastmod.invalid",
  severity: "warning",
  summary: "`<lastmod>` must be a W3C Datetime, and must not be in the future",
  rigor: "spec-required",
  sources: ["sitemaps-protocol", "google-sitemaps"],
  appliesTo: (site) => badLastmods(site).length > 0,
  check: ({ site, issue }) => {
    const bad = badLastmods(site);
    const malformed = bad.filter((e) => e.reason === "malformed");
    const future = bad.filter((e) => e.reason === "future");

    const parts: string[] = [];
    if (malformed.length > 0) {
      parts.push(
        `${malformed.length} not a W3C Datetime (${sample(malformed.map((e) => e.value))})`,
      );
    }
    if (future.length > 0) {
      parts.push(`${future.length} dated in the future (${sample(future.map((e) => e.value))})`);
    }

    return issue({
      pageUrl: site.discovery!.diagnostics.sitemapUrl ?? `${site.origin}/sitemap.xml`,
      message: `\`<lastmod>\` values a consumer cannot use: ${parts.join("; ")}. Google ignores the field entirely when it stops trusting it, so one bad batch costs the whole site the signal.`,
      origin: { kind: "computed" },
    });
  },
};

const sitemapFieldInvalid: SiteRule = {
  id: "sitemap.field.invalid",
  severity: "warning",
  summary: "`<changefreq>` and `<priority>` must hold the values the protocol defines",
  rigor: "spec-required",
  sources: ["sitemaps-protocol", "google-sitemaps"],
  appliesTo: (site) => badFields(site).length > 0,
  check: ({ site, issue }) => {
    const bad = badFields(site);
    return issue({
      pageUrl: site.discovery!.diagnostics.sitemapUrl ?? `${site.origin}/sitemap.xml`,
      message: `${bad.length} entr${bad.length === 1 ? "y carries a field" : "ies carry fields"} outside the protocol's values: ${sample(bad)}. Google ignores both fields either way — so this is worth fixing or deleting, never worth trusting.`,
      origin: { kind: "computed" },
    });
  },
};

function sitemapHost(site: SiteContext): string | undefined {
  const url = site.discovery?.diagnostics.sitemapUrl;
  try {
    return url ? new URL(url).host : new URL(site.origin).host;
  } catch {
    return undefined;
  }
}

function crossHostEntries(site: SiteContext): string[] {
  const host = sitemapHost(site);
  if (!host) return [];

  return (site.discovery?.urls ?? [])
    .filter((entry) => {
      if (!isAbsolute(entry.loc)) return false;
      try {
        return new URL(entry.loc).host !== host;
      } catch {
        return false;
      }
    })
    .map((entry) => entry.loc);
}

function protocolsIn(site: SiteContext): Set<string> {
  const protocols = new Set<string>();
  for (const entry of site.discovery?.urls ?? []) {
    try {
      protocols.add(new URL(entry.loc).protocol.replace(":", ""));
    } catch {
      continue;
    }
  }
  return protocols;
}

/**
 * W3C Datetime, as the sitemap protocol requires: a date, optionally with a
 * time and a timezone. Deliberately stricter than `Date.parse`, which accepts
 * `March 4 2026` and every other thing a human might type.
 */
const W3C_DATETIME = /^\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?)?)?$/;

function badLastmods(site: SiteContext): Array<{ value: string; reason: "malformed" | "future" }> {
  const out: Array<{ value: string; reason: "malformed" | "future" }> = [];
  // Compared against the run's own clock rather than a fixed date, and only
  // flagged past a day of slack: a build that stamps "now" in a timezone ahead
  // of the auditor is not a defect.
  const tomorrow = Date.now() + 24 * 60 * 60 * 1000;

  for (const entry of site.discovery?.urls ?? []) {
    const value = entry.lastmod?.trim();
    if (!value) continue;

    if (!W3C_DATETIME.test(value)) {
      out.push({ value, reason: "malformed" });
      continue;
    }
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed > tomorrow) out.push({ value, reason: "future" });
  }
  return out;
}

function badFields(site: SiteContext): string[] {
  const out: string[] = [];
  for (const entry of site.discovery?.urls ?? []) {
    const changefreq = entry.changefreq?.trim().toLowerCase();
    if (changefreq && !CHANGEFREQ.has(changefreq)) {
      out.push(`${entry.loc} — changefreq \`${entry.changefreq}\``);
      continue;
    }
    const priority = entry.priority?.trim();
    if (priority === undefined) continue;
    const value = Number(priority);
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      out.push(`${entry.loc} — priority \`${entry.priority}\``);
    }
  }
  return out;
}

/**
 * Where the two artefacts meet the crawl (`docs/sitemap-robots-plan.md` §4.5).
 *
 * The plan calls these "the expensive ones, and they are all judgments nothing
 * makes today". Four of the six are expensive in reasoning rather than in
 * requests — they compare a sitemap entry against a page goflag already
 * fetched, or against a robots.txt it already parsed — so they ship here.
 * `sitemap.entry.unreachable` and `.entry.redirects` need to probe URLs the
 * crawl never visited, and wait for that.
 *
 * Each one is a contradiction between two things the site says about itself,
 * which is the class of defect this whole tool exists for: nothing is broken
 * when you look at either half alone.
 */

/** A URL reduced to what makes it the same page: no fragment, no trailing slash. */
function sameUrlKey(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin}${path || "/"}${parsed.search}`;
  } catch {
    return undefined;
  }
}

/** Crawled pages, keyed the way a sitemap entry would name them. */
function pagesByUrl(site: SiteContext): Map<string, Page> {
  const byUrl = new Map<string, Page>();
  for (const page of site.pages) {
    const key = sameUrlKey(page.fetch.finalUrl);
    if (key) byUrl.set(key, page);
  }
  return byUrl;
}

/** Whether a page asks not to be indexed, by meta tag or by header. */
function saysNoindex(page: Page): boolean {
  if (metaRobotsTokens(page).has("noindex")) return true;
  const header = page.fetch.headers["x-robots-tag"] ?? "";
  return header
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .includes("noindex");
}

const sitemapEntryBlockedByRobots: SiteRule = {
  id: "sitemap.entry.blocked-by-robots",
  severity: "error",
  summary: "A sitemap must not list URLs that robots.txt forbids fetching",
  rigor: "vendor-spec",
  sources: ["ietf-rfc9309", "sitemaps-protocol"],
  // Skipped when the whole origin is disallowed: `robots.blocks-site` is that
  // finding, and repeating it once per sitemap entry would bury it.
  appliesTo: (site) =>
    site.robots?.found === true &&
    robotsAllows(site.robots.groups, "/").allowed &&
    (site.discovery?.urls.length ?? 0) > 0,
  check: ({ site, issue }) => {
    const probe = site.robots!;
    const blocked: string[] = [];

    for (const entry of site.discovery!.urls) {
      let path: string;
      try {
        const url = new URL(entry.loc);
        path = `${url.pathname}${url.search}`;
      } catch {
        continue;
      }
      if (!robotsAllows(probe.groups, path).allowed) blocked.push(entry.loc);
    }

    if (blocked.length === 0) return [];
    return issue({
      pageUrl: site.discovery!.diagnostics.sitemapUrl ?? `${site.origin}/sitemap.xml`,
      message: `${blocked.length} sitemap entr${blocked.length === 1 ? "y is" : "ies are"} disallowed by \`robots.txt\`: ${sample(blocked)}. The sitemap says "index this" and robots.txt says "never fetch it" — both cannot hold, and robots.txt is the one that decides.`,
      origin: { kind: "computed" },
    });
  },
};

const sitemapEntryNoindex: SiteRule = {
  id: "sitemap.entry.noindex",
  severity: "warning",
  summary: "A sitemap must not list URLs that ask not to be indexed",
  rigor: "vendor-spec",
  sources: ["sitemaps-protocol", "google-robots-meta"],
  // Only the crawled pages can be judged: a sitemap entry goflag never fetched
  // has no `noindex` to have seen, and assuming one either way would invent a
  // finding or hide one.
  appliesTo: (site) => (site.discovery?.urls.length ?? 0) > 0,
  check: ({ site, issue }) => {
    const byUrl = pagesByUrl(site);
    const conflicting: string[] = [];

    for (const entry of site.discovery!.urls) {
      const key = sameUrlKey(entry.loc);
      const page = key ? byUrl.get(key) : undefined;
      if (page && saysNoindex(page)) conflicting.push(entry.loc);
    }

    if (conflicting.length === 0) return [];
    return issue({
      pageUrl: site.discovery!.diagnostics.sitemapUrl ?? `${site.origin}/sitemap.xml`,
      message: `${conflicting.length} sitemap entr${conflicting.length === 1 ? "y declares" : "ies declare"} \`noindex\`: ${sample(conflicting)}. "Please index this" and "do not index this" are the same site's two answers to one question.`,
      origin: { kind: "computed" },
    });
  },
};

const sitemapEntryNonCanonical: SiteRule = {
  id: "sitemap.entry.non-canonical",
  severity: "warning",
  summary: "A sitemap should list canonical URLs",
  rigor: "vendor-spec",
  sources: ["sitemaps-protocol", "google-canonicalization"],
  appliesTo: (site) => (site.discovery?.urls.length ?? 0) > 0,
  check: ({ site, issue }) => {
    const byUrl = pagesByUrl(site);
    const wrong: string[] = [];

    for (const entry of site.discovery!.urls) {
      const key = sameUrlKey(entry.loc);
      const page = key ? byUrl.get(key) : undefined;
      const canonical = page?.links.canonical;
      if (!page || !canonical) continue;

      const canonicalKey = sameUrlKey(canonical);
      // Only when the page names a *different* page. A canonical that differs
      // by a trailing slash is the same page said twice, which `sameUrlKey`
      // already folds together.
      if (canonicalKey && canonicalKey !== key) {
        wrong.push(`${entry.loc} → ${canonical}`);
      }
    }

    if (wrong.length === 0) return [];
    return issue({
      pageUrl: site.discovery!.diagnostics.sitemapUrl ?? `${site.origin}/sitemap.xml`,
      message: `${wrong.length} sitemap entr${wrong.length === 1 ? "y names a page whose canonical" : "ies name pages whose canonicals"} point elsewhere: ${sample(wrong)}. The sitemap is a list of what to index, so it should name the URL the site itself prefers.`,
      origin: { kind: "computed" },
    });
  },
};

const sitemapOrphans: SiteRule = {
  id: "sitemap.orphans",
  severity: "warning",
  summary: "Indexable pages the crawl found should be listed in the sitemap",
  rigor: "guideline",
  sources: ["sitemaps-protocol", "google-sitemaps"],
  // One finding with a count and a sample, not one per page — the same shape
  // translation holes take, and for the same reason: forty repeats of one
  // omission is noise, and the omission is a property of the sitemap.
  appliesTo: (site) => site.discovery?.diagnostics.found === true && site.discovery.urls.length > 0,
  check: ({ site, issue }) => {
    const listed = new Set(
      site.discovery!.urls.map((entry) => sameUrlKey(entry.loc)).filter(Boolean),
    );

    const orphans = site.pages
      .filter((page) => !saysNoindex(page))
      .map((page) => ({ page, key: sameUrlKey(page.fetch.finalUrl) }))
      .filter(({ key }) => key !== undefined && !listed.has(key))
      .map(({ page }) => page.fetch.finalUrl);

    if (orphans.length === 0) return [];
    return issue({
      pageUrl: site.discovery!.diagnostics.sitemapUrl ?? `${site.origin}/sitemap.xml`,
      message: `${orphans.length} crawled page${orphans.length === 1 ? "" : "s"} ask${orphans.length === 1 ? "s" : ""} to be indexed and ${orphans.length === 1 ? "is" : "are"} absent from the sitemap: ${sample(orphans)}. A consumer that reads the sitemap rather than following links will never see ${orphans.length === 1 ? "it" : "them"}.`,
      origin: { kind: "computed" },
    });
  },
};

/**
 * The last two of §4.5, and the only rules in the catalogue whose subject had
 * to be fetched on purpose.
 *
 * Everything else about a sitemap is a comparison between things goflag
 * already had. These two ask what is actually served at a URL, which is why
 * they waited for `probeSitemapEntries` — and why that pass answers from the
 * crawl and the link audit first, and only fetches what is left.
 */

/** What the probe pass found, or nothing when it did not run. */
function entryProbes(site: SiteContext): SitemapEntryProbe[] {
  return [...(site.sitemapEntries?.byUrl.values() ?? [])];
}

/**
 * The sentence a finding owes when the caps stopped the pass short.
 *
 * "3 entries are unreachable" out of a sitemap where 400 were never checked is
 * a true sentence that reads as a false one — it implies the other 397 are
 * fine. Saying how many went unchecked is what makes the number honest.
 */
function coverageNote(site: SiteContext): string {
  const unprobed = site.sitemapEntries?.unprobed ?? 0;
  if (unprobed === 0) return "";
  return ` ${unprobed} further entr${unprobed === 1 ? "y was" : "ies were"} not checked — this count is a floor, not a total.`;
}

const sitemapEntryUnreachable: SiteRule = {
  id: "sitemap.entry.unreachable",
  severity: "error",
  summary: "Every URL a sitemap lists must answer",
  rigor: "vendor-spec",
  sources: ["sitemaps-protocol", "google-sitemaps"],
  appliesTo: (site) => entryProbes(site).some((probe) => isDead(probe.status)),
  check: ({ site, issue }) => {
    const dead = entryProbes(site).filter((probe) => isDead(probe.status));

    return issue({
      pageUrl: site.discovery!.diagnostics.sitemapUrl ?? `${site.origin}/sitemap.xml`,
      message: `${dead.length} sitemap entr${dead.length === 1 ? "y does" : "ies do"} not answer: ${sample(dead.map((probe) => `${probe.url} (${probe.status === 0 ? "no response" : `HTTP ${probe.status}`})`))}. A sitemap is a list of pages to index, so every dead entry spends crawl budget on a promise the site does not keep.${coverageNote(site)}`,
      origin: { kind: "computed" },
    });
  },
};

const sitemapEntryRedirects: SiteRule = {
  id: "sitemap.entry.redirects",
  severity: "warning",
  summary: "A sitemap should list final URLs, not URLs that redirect",
  rigor: "guideline",
  sources: ["sitemaps-protocol", "google-sitemaps"],
  appliesTo: (site) => entryProbes(site).some((probe) => probe.redirected && !isDead(probe.status)),
  check: ({ site, issue }) => {
    const moved = entryProbes(site).filter((probe) => probe.redirected && !isDead(probe.status));

    return issue({
      pageUrl: site.discovery!.diagnostics.sitemapUrl ?? `${site.origin}/sitemap.xml`,
      message: `${moved.length} sitemap entr${moved.length === 1 ? "y redirects" : "ies redirect"}: ${sample(moved.map((probe) => `${probe.url} → ${probe.finalUrl}`))}. Google asks for the final URL, and every hop is crawl budget spent plus one more chance for a consumer to disagree about which address is the page.${coverageNote(site)}`,
      origin: { kind: "computed" },
    });
  },
};

/** 4xx, 5xx, or no response at all. A 3xx is a redirect, not a death. */
function isDead(status: number): boolean {
  return status === 0 || status >= 400;
}

/** A status that means the file could not be read, as opposed to absent. */
function isRobotsFailure(status: number): boolean {
  return status === 0 || status >= 500;
}

function isAbsolute(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Ordered registry. Ids are unique; the runner relies on that for lookup. */
export const SITE_RULES: ReadonlyArray<SiteRule> = [
  hreflangMissing,
  hreflangClusterIncomplete,
  hreflangSitemapMismatch,
  iconsIcoMissing,
  robotsBlocksPage,
  robotsBlocksSite,
  robotstxtCrossOrigin,
  robotstxtInvalidLine,
  robotstxtOversized,
  robotstxtSitemapRelative,
  robotstxtUnknownDirective,
  robotstxtUnreachable,
  sitemapEmpty,
  sitemapEntryBlockedByRobots,
  sitemapEntryCrossHost,
  sitemapEntryInvalidUrl,
  sitemapEntryNoindex,
  sitemapEntryNonCanonical,
  sitemapEntryOutOfScope,
  sitemapEntryProtocolMismatch,
  sitemapEntryRedirects,
  sitemapEntryUnreachable,
  sitemapFieldInvalid,
  sitemapIndexChildError,
  sitemapLastmodInvalid,
  sitemapLimitsExceeded,
  sitemapMissing,
  sitemapOrphans,
  sitemapUnparsable,
];

export function getSiteRule(id: string): SiteRule | undefined {
  return SITE_RULES.find((rule) => rule.id === id);
}
