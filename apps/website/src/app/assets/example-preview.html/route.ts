import { PREVIEW_EXAMPLE } from "@/lib/preview-example";

/**
 * The `goflag preview` example, served exactly as the CLI wrote it.
 *
 * Deposited, not photographed. `docs/preview-plan.md` D2 calls the artefact "a
 * self-contained HTML file — no assets beside it, no server", which makes it a
 * file to hand over rather than a subject to screenshot: a PNG would show the
 * top third of it and none of its links.
 *
 * ## The `.html` in the segment is load-bearing
 *
 * `proxy.ts:70` matches `/((?!api|_next|apple-icon|docs|og|raw|llms.txt|.*\..*).*)`
 * and rewrites everything it matches under a locale. A segment named
 * `example-preview` would match, be rewritten to `/en/assets/example-preview`,
 * and 404 — the same defect that forced `og` and `apple-icon` into that
 * exclusion list by name. A segment carrying a dot falls into the `.*\..*`
 * negation on its own, so this route needs no entry there.
 *
 * ## Two headers the site sets globally, and what they mean here
 *
 * `X-Content-Type-Options: nosniff` is set for every path, so the content type
 * below has to be exact or the browser refuses to render it. And
 * `X-Frame-Options: DENY` applies too, which is why the docs page links to
 * this document rather than embedding it — an iframe would be blocked even
 * same-origin.
 *
 * The document carries its own `<meta http-equiv="Content-Security-Policy">`
 * with `img-src http: https: data:`, which is what lets the social cards load
 * the images the audited pages declare. The site sets no CSP header of its
 * own, so that meta policy is the only one in play.
 */
export const dynamic = "force-static";

export function GET() {
  return new Response(PREVIEW_EXAMPLE, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
}
