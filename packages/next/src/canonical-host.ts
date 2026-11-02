import { parseBaseUrl } from "./site";

/**
 * One site, one host.
 *
 * `www` and the apex usually point at one server, so the variant a site does not
 * canonicalise on serves a full copy of it. The copy's canonical names the right
 * host, but a canonical is a hint: Google sometimes keeps the copy. A redirect is
 * the answer it cannot overrule.
 *
 * A function of its own and not a method of `Site`, because `next.config` runs
 * before any bundler does and cannot import a `site.ts` that imports
 * `content-collections`. It takes the origin as a value, like `defineSite`.
 */

/**
 * The shape `redirects()` takes in `next.config`. Declared here because Next's
 * own `Redirect` type lives under `next/dist`, outside what it publishes;
 * `canonical-host.test.ts` holds this one assignable to `NextConfig`.
 */
export interface CanonicalHostRedirect {
  source: string;
  has: { type: "host"; value: string }[];
  destination: string;
  permanent: true;
}

/** Next compiles a `has` value as a regex, anchoring it at both ends. */
function escapeRegExp(text: string): string {
  return text.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

/**
 * The permanent redirect from the other host variant to `baseUrl`'s origin:
 * `www.<host>` when `baseUrl` is on the apex, the apex when it is on `www`.
 *
 * The port plays no part in the match, since Next strips it from `Host` before
 * comparing. A path in `baseUrl` is dropped: this names an origin, and it is
 * `defineSite` that refuses one with a path. Next carries the query string over
 * by itself.
 *
 * @throws when `baseUrl` is not an absolute http(s) URL.
 */
export function canonicalHostRedirect(baseUrl: string): CanonicalHostRedirect {
  const { hostname, origin } = parseBaseUrl(baseUrl);
  const other = hostname.startsWith("www.") ? hostname.slice("www.".length) : `www.${hostname}`;

  return {
    source: "/:path*",
    has: [{ type: "host", value: escapeRegExp(other) }],
    destination: `${origin}/:path*`,
    permanent: true,
  };
}
