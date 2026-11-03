/**
 * Request headers the operator asked for (`--header`), and the one place that
 * decides where they may go.
 *
 * The use is a protected preview: a Vercel deployment behind
 * `x-vercel-protection-bypass`, a staging host behind basic auth, a review app
 * behind a session cookie. Without them the audit judges a login page.
 *
 * The value is a credential, so two rules hold everywhere:
 *
 *   - **It goes to the audited origin and nowhere else.** Not to an external
 *     link the checker probes, not to an `og:image` on a CDN, not to a sitemap
 *     entry on another host. Scheme, host and port must all match.
 *   - **It does not follow a redirect off that origin.** Fetch's own redirect
 *     handling strips `Authorization` when a hop changes origin, and nothing
 *     else: `x-vercel-protection-bypass` would be sent to whatever host the
 *     preview redirects to. So when headers apply, `fetchScoped` follows
 *     redirects itself and attaches them hop by hop.
 *
 * And one more, which no code here enforces but every caller must keep: the
 * value is never printed. The report carries the header *names*
 * (`diagnostics.requestHeaders`), errors name the header, and nothing echoes
 * what follows the colon. `betterleaks` refuses a credential at commit time;
 * a tool that copies one into a CI log has already leaked it.
 */

/** Headers that apply to one origin. `origin` is `new URL(…).origin`. */
export interface ScopedHeaders {
  readonly origin: string;
  readonly headers: Readonly<Record<string, string>>;
}

/**
 * Names goflag sets itself, or that only the HTTP stack may set. Overriding
 * `user-agent` or `accept` would change what the audit observes (the
 * bot-detection 403s the default UA exists to avoid, the content negotiation
 * the sitemap fetch relies on), and the hop-by-hop ones are not the caller's
 * to choose.
 */
export const RESERVED_HEADER_NAMES: readonly string[] = [
  "accept",
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "user-agent",
];

/** RFC 9110 §5.6.2 `token`: what a field name may be made of. */
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/**
 * Parse one `--header` argument. The first colon separates the name from the
 * value; the value may itself contain colons (`Authorization: Basic …`).
 *
 * Errors name the header and never quote the value — the value is exactly what
 * must not reach a terminal.
 */
export function parseHeaderArg(raw: string): { name: string; value: string } {
  const colon = raw.indexOf(":");
  if (colon === -1) throw new Error('--header expects "<name>: <value>"');
  const name = raw.slice(0, colon).trim();
  const value = raw.slice(colon + 1).trim();
  if (!name || !TOKEN.test(name)) {
    throw new Error('--header expects "<name>: <value>", with a valid header name');
  }
  if (!value) throw new Error(`--header ${name} has an empty value`);
  if (/[\r\n\0]/.test(value)) {
    throw new Error(`--header ${name} has a line break or a NUL in its value`);
  }
  if (RESERVED_HEADER_NAMES.includes(name.toLowerCase())) {
    throw new Error(`--header ${name} is set by goflag itself and cannot be overridden`);
  }
  return { name, value };
}

/** The headers that apply to `url` under `scope`, or none. */
export function headersFor(url: string, scope: ScopedHeaders | undefined): Record<string, string> {
  if (!scope || !sameOrigin(url, scope.origin)) return {};
  return { ...scope.headers };
}

/** Whether `url` is on `origin`. A URL that does not parse is on no origin. */
export function sameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

const MAX_REDIRECTS = 20;

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/**
 * `fetch`, with the operator's headers attached where they belong.
 *
 * With no scope, or a URL off the scope's origin, this is `fetch` itself:
 * nothing is attached, and the platform's redirect handling is left alone —
 * a redirect that lands on the audited origin from elsewhere was not asked for
 * with the headers, and does not get them.
 *
 * On the origin, `redirect: "manual"` stays a single request. `"follow"` — the
 * default — is followed here, one hop at a time, with the headers attached to
 * the hops that stay on the origin. The response is the last hop's, so
 * `response.url` is the final URL, as with the platform's own loop;
 * `redirected` is set on it, since a manually fetched response cannot know.
 * Only GET and HEAD go through here, so no hop changes the method.
 */
export async function fetchScoped(
  url: string,
  init: RequestInit,
  scope: ScopedHeaders | undefined,
): Promise<Response> {
  if (!scope || !sameOrigin(url, scope.origin)) return fetch(url, init);

  const withHeaders = (target: string): RequestInit => ({
    ...init,
    redirect: "manual",
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      ...headersFor(target, scope),
    },
  });

  if (init.redirect === "manual") return fetch(url, withHeaders(url));

  let current = url;
  for (let hops = 0; ; hops++) {
    const res = await fetch(current, withHeaders(current));
    const location = isRedirectStatus(res.status) ? res.headers.get("location") : null;
    if (!location) {
      if (hops > 0) Object.defineProperty(res, "redirected", { value: true });
      return res;
    }
    if (hops >= MAX_REDIRECTS) {
      await res.body?.cancel().catch(() => undefined);
      throw new TypeError("fetch failed: redirect count exceeded");
    }
    await res.body?.cancel().catch(() => undefined);
    current = new URL(location, current).toString();
  }
}
