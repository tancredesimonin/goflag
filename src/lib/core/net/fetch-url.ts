/**
 * Shared low-level fetch primitive.
 *
 * A politer, more general cousin of the private `fetchDoc` inside
 * `sitemap/discover.ts`. The link engine (`links/check.ts`,
 * `links/audit.ts`) and the strengthened sitemap engine both need a
 * single "fetch a URL and tell me its status / final URL / body" helper
 * that:
 *
 *   - composes a caller `AbortSignal` with a timeout (`combineSignals`),
 *   - relaxes TLS verification on request (the `relaxTlsIfRequested`
 *     pattern from `discover.ts`),
 *   - sends a real browser User-Agent by default so bot-detection
 *     middleware doesn't return false-positive 403s, and
 *   - never throws — every failure collapses into a shaped result with a
 *     `status: 0` and a `reason`, mirroring the rest of the engine.
 *
 * Like everything under `src/lib/core/**`, this module is plain and
 * JSON-serializable with no Next.js / React / DOM coupling so it can
 * ship as part of `@goflag/core`.
 */

import { combineSignals } from "../probes/abort";

/** Why a fetch produced no usable HTTP response. */
export type FetchFailureReason = "timeout" | "dns" | "tls" | "abort" | "network";

export interface FetchUrlOptions {
  /** Caller-driven cancellation, composed with the timeout. */
  signal?: AbortSignal;
  /** Per-request timeout in ms. Defaults to 8_000. */
  timeoutMs?: number;
  /** HTTP method. Defaults to "GET". HEAD never returns a body. */
  method?: "GET" | "HEAD";
  /** Allow self-signed / invalid TLS (localhost, tunnels). */
  allowInsecureTls?: boolean;
  /** Override the User-Agent. Defaults to a real browser UA. */
  userAgent?: string;
  /**
   * Redirect handling. "follow" (default) lets the platform follow
   * redirects and reports the final URL. "manual" performs a single hop
   * and resolves the `Location` header into `finalUrl` so a caller can
   * drive its own redirect loop (used by `checkLink`).
   */
  redirect?: "follow" | "manual";
  /**
   * Cap on the number of body bytes read for GET. Defaults to 3 MB.
   * Bodies are truncated (not omitted) at the cap so HTML scans still
   * get most of the document.
   */
  maxBytes?: number;
  /** Override the Accept header. */
  accept?: string;
}

export interface FetchUrlResult {
  /** The URL we were asked to fetch. */
  requestedUrl: string;
  /** The URL after redirects (== requestedUrl when none / on error). */
  finalUrl: string;
  /** HTTP status. `0` on network error. */
  status: number;
  /** True when at least one redirect was observed. */
  redirected: boolean;
  /**
   * In "manual" mode, the single next-hop `Location` (resolved
   * absolute) when the response was a redirect; otherwise empty.
   */
  redirectChain: string[];
  /** Lower-cased content-type sans parameters, when the server sent one. */
  contentType?: string;
  /** Raw `Retry-After` header value, when present (for 429 / 503 backoff). */
  retryAfter?: string;
  /** Decoded text body. Omitted for HEAD, non-text, or network errors. */
  body?: string;
  /** True when the body was truncated at `maxBytes`. */
  truncated?: boolean;
  /** Failure classification when `status === 0`. */
  reason?: FetchFailureReason;
  /** Wall-clock duration of the attempt in ms. */
  durationMs: number;
}

/**
 * A current, real desktop Chrome UA string. Bot-detection middleware on
 * many hosts returns 403/429 for obviously-scripted UAs; presenting a
 * believable browser keeps the link checker's false-positive rate low.
 */
export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_BYTES = 3 * 1024 * 1024;
const DEFAULT_ACCEPT =
  "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif," + "image/webp,*/*;q=0.8";

/** Content-type families we will decode into `body`. */
const TEXTY = /(text\/|application\/(xhtml\+xml|xml|json|.*\+xml|.*\+json|javascript))/;

export async function fetchUrl(
  url: string,
  options: FetchUrlOptions = {},
): Promise<FetchUrlResult> {
  const method = options.method ?? "GET";
  const redirect = options.redirect ?? "follow";
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const startedAt = Date.now();

  const { signal, cleanup } = combineSignals(
    options.signal,
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  const restoreTls = relaxTlsIfRequested(options.allowInsecureTls);

  try {
    const res = await fetch(url, {
      method,
      signal,
      redirect,
      headers: {
        "user-agent": options.userAgent ?? DEFAULT_USER_AGENT,
        accept: options.accept ?? DEFAULT_ACCEPT,
      },
    });

    const contentType = normaliseContentType(res.headers.get("content-type"));
    const result: FetchUrlResult = {
      requestedUrl: url,
      finalUrl: res.url || url,
      status: res.status,
      redirected: res.redirected,
      redirectChain: [],
      contentType,
      durationMs: Date.now() - startedAt,
    };
    const retryAfter = res.headers.get("retry-after");
    if (retryAfter) result.retryAfter = retryAfter;

    if (redirect === "manual" && isRedirectStatus(res.status)) {
      const location = res.headers.get("location");
      if (location) {
        try {
          const next = new URL(location, url).toString();
          result.finalUrl = next;
          result.redirectChain = [next];
          result.redirected = true;
        } catch {
          // A malformed Location header — leave finalUrl as requested.
        }
      }
      // Drain so the socket can be reused; never read a redirect body.
      await res.body?.cancel().catch(() => undefined);
      return result;
    }

    if (method === "HEAD") {
      await res.body?.cancel().catch(() => undefined);
      return result;
    }

    if (contentType && !TEXTY.test(contentType)) {
      await res.body?.cancel().catch(() => undefined);
      return result;
    }

    const { text, truncated } = await readCappedText(res, maxBytes);
    result.body = text;
    if (truncated) result.truncated = true;
    return result;
  } catch (err) {
    return {
      requestedUrl: url,
      finalUrl: url,
      status: 0,
      redirected: false,
      redirectChain: [],
      reason: classifyError(err, options.signal),
      durationMs: Date.now() - startedAt,
    };
  } finally {
    cleanup();
    restoreTls();
  }
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function normaliseContentType(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const semi = raw.indexOf(";");
  return (semi === -1 ? raw : raw.slice(0, semi)).trim().toLowerCase() || undefined;
}

/**
 * Read a response body as UTF-8 text, stopping once `maxBytes` have been
 * consumed. Falls back to a buffered read if the body isn't a stream.
 */
async function readCappedText(
  res: Response,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  const reader = res.body?.getReader();
  if (!reader) {
    const text = await res.text();
    if (text.length > maxBytes) {
      return { text: text.slice(0, maxBytes), truncated: true };
    }
    return { text, truncated: false };
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    received += value.byteLength;
    if (received >= maxBytes) {
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
  }

  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  const sliced = buf.byteLength > maxBytes ? buf.subarray(0, maxBytes) : buf;
  return { text: sliced.toString("utf8"), truncated };
}

/** Map a thrown fetch error onto a coarse, reportable reason. */
function classifyError(err: unknown, callerSignal?: AbortSignal): FetchFailureReason {
  if (isAbortError(err)) {
    // combineSignals fires the same controller for both the timeout and a
    // caller cancel, so distinguish by inspecting the caller's signal.
    return callerSignal?.aborted ? "abort" : "timeout";
  }
  const code = errorCode(err);
  if (code) {
    if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "dns";
    if (code.startsWith("CERT_") || code.includes("SELF_SIGNED") || code.includes("CERT")) {
      return "tls";
    }
  }
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (message.includes("certificate") || message.includes("tls") || message.includes("ssl")) {
    return "tls";
  }
  return "network";
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

function errorCode(err: unknown): string | undefined {
  if (err && typeof err === "object") {
    const direct = (err as { code?: unknown }).code;
    if (typeof direct === "string") return direct;
    const cause = (err as { cause?: unknown }).cause;
    if (cause && typeof cause === "object") {
      const causeCode = (cause as { code?: unknown }).code;
      if (typeof causeCode === "string") return causeCode;
    }
  }
  return undefined;
}

/**
 * Temporarily disable Node's TLS verification when the caller opted in
 * (localhost / self-signed tunnels). Returns a restore callback the
 * caller MUST run in `finally`. Mirrors `discover.ts`.
 */
function relaxTlsIfRequested(enabled: boolean | undefined): () => void {
  if (!enabled) return () => undefined;
  const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  return () => {
    if (previous === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
  };
}
