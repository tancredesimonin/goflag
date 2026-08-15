import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { routing } from "./i18n/routing";
import { site } from "./lib/seo/site";

const intl = createMiddleware(routing);

/**
 * Locale aliases, redirected once and permanently.
 *
 * `/pt-BR/about` and `/PT/about` name the same page as `/pt/about`. Served as
 * they are, they would answer 200 and the site would have two URLs for one
 * page; refused, they would be dead links from anywhere that guessed or
 * remembered the old form. A 301 is the only answer that leaves one canonical
 * URL and loses nothing — which is also what makes renaming `/pt-br/` to
 * `/pt/` free.
 *
 * `site.resolveLocale` is RFC 4647 Lookup, and it never falls back to the
 * default locale: `/de/` resolves to nothing and falls through to a 404.
 * Redirecting it to English instead would turn every two-letter segment into a
 * soft 404 — a defect goflag itself reports.
 */
export default function proxy(request: NextRequest) {
  const [, first, ...rest] = request.nextUrl.pathname.split("/");

  if (first !== undefined && first !== "") {
    const resolved = site.resolveLocale(first);

    if (resolved !== undefined && resolved !== first) {
      const url = request.nextUrl.clone();
      url.pathname = ["", resolved, ...rest].join("/");
      return NextResponse.redirect(url, 301);
    }
  }

  return intl(request);
}

/**
 * `/docs` is deliberately outside the locale prefix.
 *
 * The documentation is English-only: eleven reference pages describing a CLI
 * still in `0.x`, and a stale Spanish page listing a flag that no longer exists
 * is worse than no page at all. Leaving it unprefixed rather than serving it
 * under `/en/docs` means it never enters the route × locale matrix, so goflag
 * reports no translation holes for it — the absence is structural, not a gap.
 *
 * `llms.txt`, `/raw` and `/og` are excluded for the same reason: they are
 * machine surfaces with no locale of their own.
 *
 * `/og` was missing from that list, and nothing said so. It serves the
 * documentation's preview cards — the route handler that exists because Next
 * refuses to place a metadata image under a catch-all — so every request for
 * one was redirected to `/en/og/...`, which no route renders. `og:image` on the
 * documentation pages has therefore pointed at a 404 since the route was
 * written: a tag present, well-formed, absolute, and dead. `og.image.reachable`
 * is the rule that would have said so, and it is the next one to write.
 */
export const config = {
  matcher: ["/((?!api|_next|docs|og|raw|llms.txt|.*\\..*).*)"],
};
