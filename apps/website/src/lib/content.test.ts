import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { allDocs, allLegals } from "content-collections";
import { describe, expect, it } from "vitest";

import { locales } from "@/i18n/config";

/**
 * Every MDX file on disk must become a document.
 *
 * This is not a formality. `content/docs/report.mdx` had an unquoted colon in
 * its YAML description; the frontmatter failed to parse, content-collections
 * dropped the file without failing the build, and the page 404'd in production
 * while `content/docs/index.mdx` linked to it. Nothing noticed until goflag
 * crawled the site and reported the broken link.
 *
 * A document can go missing for any number of reasons — bad YAML, a schema
 * field that moved, a rename. What they have in common is that the build stays
 * green and a page disappears. Counting files against documents catches all of
 * them at once, which is why this compares the directory rather than testing
 * the one bug that happened.
 */

const CONTENT = path.resolve(__dirname, "../../content");

function mdxFilesIn(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".mdx"))
    .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)));
}

describe("the docs collection", () => {
  const files = mdxFilesIn(path.join(CONTENT, "docs"));

  it("has a document for every file on disk", () => {
    const expected = files.map((file) => file.replace(/\.mdx$/, "")).sort();
    const collected = allDocs.map((doc) => doc.slug).sort();

    expect(collected).toEqual(expected);
  });

  it("finds documents at all — an empty collection would satisfy nothing else here", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("gives every document the fields the pages and the sitemap read", () => {
    for (const doc of allDocs) {
      expect(doc.title, `${doc.slug} has no title`).toBeTruthy();
      expect(doc.description, `${doc.slug} has no description`).toBeTruthy();
    }
  });
});

describe("the legal collection", () => {
  const files = mdxFilesIn(path.join(CONTENT, "legal"));

  it("has a document for every file on disk", () => {
    // `<locale>/<slug>.mdx` — the locale is the directory.
    const expected = files.map((file) => file.replace(/\.mdx$/, "")).sort();
    const collected = allLegals.map((doc) => `${doc.locale}/${doc.slug}`).sort();

    expect(collected).toEqual(expected);
  });

  it("declares only locales the site serves", () => {
    // A stray directory would otherwise become a language: the route registry
    // drops unknown tags, so the page would exist and never be advertised.
    for (const doc of allLegals) {
      expect(locales, `${doc.locale}/${doc.slug} is in an unserved locale`).toContain(doc.locale);
    }
  });
});

/**
 * A link in the content names the URL its page is served at.
 *
 * `[changelog](/changelog)` looked harmless. The locale proxy answers
 * `/changelog` with a redirect to `/en/changelog`, and a reader who clicks lands
 * on the right page. But `<Link>` does more than follow a click: it prefetches
 * every link in the viewport, and the prefetch of that one never settled. On
 * 2026-09-29, `/docs/ci#exit-codes` sent 3,420 requests in the six seconds after
 * `load` — `/changelog?_rsc=…`, a 307 to `/en/changelog`, a 307 to
 * `/en/changelog?_rsc=…`, a 200, and straight back to the first, for as long as
 * the link stayed in view. `/docs/report` did the same from its "Stability"
 * section, and on a desktop screen every `/<locale>/cookies` page did it from
 * the moment it loaded, through `[privacy policy](/privacy-policy)`. The build
 * of `main` — Next 16.3.5, what production ran — looped exactly as 16.3.6 does.
 *
 * The loop is Next's. The logo's prefetch of `/en` teaches the router that
 * `/[locale]` is a page, so it predicts `/changelog` as that page with
 * `locale: "changelog"` and skips the request that would have found the
 * redirect. The server answers for `/[locale]/changelog` instead, the router
 * takes the mismatch for a rewrite and retries at once — a retry its source
 * says "can't loop". With the `/en` prefetch blocked, the same link settled
 * after four requests.
 *
 * What the site controls is the link, so every internal link names a URL the
 * proxy passes through untouched: under a locale the site serves, or outside
 * the proxy's matcher — `/docs`, or a file. The matcher is read out of
 * `src/proxy.ts` rather than restated here: Next reads it there, as a literal,
 * and a copy would be free to drift from the one that runs.
 */

/**
 * The internal links a document renders, read from its compiled MDX rather
 * than from its source.
 *
 * Inline, titled or by reference, a Markdown link compiles to the `a` component
 * with an `href` — the component `mdx.tsx` hands to the router — and a path
 * quoted in code compiles to text. Matching `](/…)` in the source would be a
 * second Markdown parser, and a worse one: it never sees `[x][ref]` whose
 * `[ref]: /changelog` is declared further down, and it takes a link quoted
 * inside a code fence for a real one.
 */
function internalLinks(compiled: string): string[] {
  return [...compiled.matchAll(/\.a,\s*\{\s*href:\s*"(\/(?!\/)[^"]*)"/g)].map(
    (match) => match[1] ?? "",
  );
}

/** `config.matcher` in `src/proxy.ts`, as the regular expression it is. */
function proxyMatcher(): RegExp {
  const proxy = readFileSync(path.resolve(__dirname, "../proxy.ts"), "utf8");
  // Loose about whitespace: one more exclusion in the matcher and Prettier
  // breaks the array over three lines.
  const literal = /matcher:\s*\[\s*("(?:[^"\\]|\\.)*"),?\s*\]/.exec(proxy)?.[1];

  if (literal === undefined) {
    throw new Error("src/proxy.ts no longer declares its matcher as a single string");
  }

  return new RegExp(`^${JSON.parse(literal)}$`);
}

/** Whether the proxy redirects a link: it runs on the path, and no locale leads it. */
function redirected(href: string, matcher: RegExp): boolean {
  const { pathname } = new URL(href, "http://localhost");
  const [first = ""] = pathname.split("/").filter(Boolean);

  return matcher.test(pathname) && !(locales as readonly string[]).includes(first);
}

describe("links in the content", () => {
  const links = [
    ...allDocs.map((doc) => ({ file: `docs/${doc._meta.filePath}`, compiled: doc.content })),
    ...allLegals.map((doc) => ({ file: `legal/${doc._meta.filePath}`, compiled: doc.content })),
  ].flatMap(({ file, compiled }) => internalLinks(compiled).map((href) => ({ file, href })));

  it("are found at all — an empty list would pass the check below", () => {
    // Which is what a change in the shape of the compiled output would produce.
    expect(links.length).toBeGreaterThan(0);
  });

  it("never name a URL the locale proxy redirects", () => {
    const matcher = proxyMatcher();

    // Read back as what `src/proxy.ts` says it does: it runs on `/changelog`
    // and stands back from `/docs`. A matcher that parsed into something else
    // would pass every link below.
    expect([matcher.test("/changelog"), matcher.test("/docs/ci")]).toEqual([true, false]);

    const offenders = links
      .filter(({ href }) => redirected(href, matcher))
      .map(({ file, href }) => `${file}: ${href}`);

    expect(offenders, "name each page under its locale — /en/changelog, not /changelog").toEqual(
      [],
    );
  });
});
