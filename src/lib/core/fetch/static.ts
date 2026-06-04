import type { FetchMeta } from "../types";

export interface FetchStaticOptions {
  /** Per-request timeout in ms. Defaults to 15_000. */
  timeoutMs?: number;
  /** Maximum redirects to follow. Defaults to 10. */
  maxRedirects?: number;
  /** Override the User-Agent header. Defaults to a Goflag UA. */
  userAgent?: string;
  /** Allow self-signed certificates (for `*.local` and tunnels). */
  allowInsecureTls?: boolean;
  /** Optional AbortSignal for caller-driven cancellation. */
  signal?: AbortSignal;
}

export interface FetchStaticResult {
  meta: FetchMeta;
  body: string;
}

const DEFAULT_UA = "Goflag/0.0 (+https://github.com/tancredesimonin-indie/goflag)";

export class FetchError extends Error {
  readonly url: string;
  override readonly cause?: unknown;
  constructor(message: string, url: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "FetchError";
    this.url = url;
    this.cause = options?.cause;
  }
}

/**
 * Fetch an HTML document and return its body + observed network metadata.
 *
 * Implementation notes:
 *  - We use `fetch` (Node 20+ built-in undici) with `redirect: "manual"` so we
 *    can count redirects ourselves and still report the final URL.
 *  - For `*.local` and other self-signed hosts the caller can opt into
 *    `allowInsecureTls` which sets `NODE_TLS_REJECT_UNAUTHORIZED=0` for the
 *    duration of this request only (process-global, restored on completion).
 *  - All errors thrown by this module are `FetchError` instances with a clear
 *    user-facing message.
 */
export async function fetchStatic(
  url: string,
  options: FetchStaticOptions = {},
): Promise<FetchStaticResult> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxRedirects = options.maxRedirects ?? 10;
  const userAgent = options.userAgent ?? DEFAULT_UA;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new FetchError(`Invalid URL: ${url}`, url);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new FetchError(
      `Unsupported protocol "${parsed.protocol}" — only http(s) is supported`,
      url,
    );
  }

  const abort = new AbortController();
  const onCallerAbort = () => abort.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", onCallerAbort, { once: true });
  const timeout = setTimeout(
    () => abort.abort(new FetchError("Request timed out", url)),
    timeoutMs,
  );

  const restoreTls = relaxTlsIfRequested(options.allowInsecureTls);
  const start = performance.now();

  try {
    let currentUrl = parsed.toString();
    let redirects = 0;
    let response: Response | undefined;
    while (true) {
      try {
        response = await fetch(currentUrl, {
          method: "GET",
          redirect: "manual",
          headers: {
            "user-agent": userAgent,
            accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          },
          signal: abort.signal,
        });
      } catch (err) {
        throw new FetchError(`Network error fetching ${currentUrl}: ${describe(err)}`, url, {
          cause: err,
        });
      }

      if (isRedirect(response.status)) {
        const location = response.headers.get("location");
        if (!location) {
          throw new FetchError(
            `Redirect ${response.status} from ${currentUrl} missing Location header`,
            url,
          );
        }
        if (redirects >= maxRedirects) {
          throw new FetchError(
            `Exceeded maximum of ${maxRedirects} redirects (last hop: ${currentUrl})`,
            url,
          );
        }
        // Drain the body so the underlying connection can be reused.
        await response.body?.cancel().catch(() => undefined);
        currentUrl = new URL(location, currentUrl).toString();
        redirects += 1;
        continue;
      }

      const body = await response.text();
      const headers = headersToObject(response.headers);
      const contentType = stripContentTypeParams(headers["content-type"]);
      const meta: FetchMeta = {
        requestedUrl: parsed.toString(),
        finalUrl: currentUrl,
        status: response.status,
        statusText: response.statusText,
        headers,
        redirectCount: redirects,
        durationMs: Math.round(performance.now() - start),
        bodyBytes: Buffer.byteLength(body, "utf8"),
        contentType,
      };
      return { meta, body };
    }
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onCallerAbort);
    restoreTls();
  }
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((v, k) => {
    out[k.toLowerCase()] = v;
  });
  return out;
}

function stripContentTypeParams(value?: string): string | undefined {
  if (!value) return undefined;
  const semi = value.indexOf(";");
  return (semi === -1 ? value : value.slice(0, semi)).trim().toLowerCase();
}

function relaxTlsIfRequested(enabled: boolean | undefined): () => void {
  if (!enabled) return () => undefined;
  const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  return () => {
    if (previous === undefined) {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    } else {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
    }
  };
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
