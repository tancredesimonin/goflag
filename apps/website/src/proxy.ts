import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

/**
 * `/docs` is deliberately outside the locale prefix.
 *
 * The documentation is English-only: eleven reference pages describing a CLI
 * still in `0.x`, and a stale Spanish page listing a flag that no longer exists
 * is worse than no page at all. Leaving it unprefixed rather than serving it
 * under `/en/docs` means it never enters the route × locale matrix, so goflag
 * reports no translation holes for it — the absence is structural, not a gap.
 *
 * `llms.txt` and `/raw` are excluded for the same reason: they are machine
 * surfaces with no locale of their own.
 */
export const config = {
  matcher: ["/((?!api|_next|docs|raw|llms.txt|.*\\..*).*)"],
};
