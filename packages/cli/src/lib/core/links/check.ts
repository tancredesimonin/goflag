/**
 * Per-URL link check.
 *
 * The make-or-break of a credible link checker is *avoiding false
 * positives*. The logic here:
 *
 *   1. Skip non-checkable schemes (`mailto:`/`tel:`/`data:`/`javascript:`).
 *   2. Try `HEAD` first (cheap); fall back to `GET` when the server
 *      rejects HEAD (`405`/`501`, often `403`) or returns no useful
 *      status.
 *   3. Follow redirects up to a hop cap, recording the chain. A loop or a
 *      chain ending in `4xx/5xx` is `broken`; a chain ending in `2xx` is
 *      `redirect` (a signal, not breakage).
 *   4. Soft-404 heuristic: a `200` whose body is short and says "not
 *      found" → `warning`.
 *   5. Anti-bot: `403`/`429` → `blocked`, triaged separately.
 *   6. Retry once on `429`/`5xx`/network errors with a short jittered
 *      backoff, honouring `Retry-After` (capped).
 *   7. Network failures (`dns`/`timeout`/`tls`/`network`) → `broken` with
 *      the reason attached.
 *
 * Never throws — every path returns a shaped `LinkCheck`.
 */

import { capText, fetchUrl, type FetchFailureReason } from "../net/fetch-url";
import { classifyLink } from "./classify";
import type { LinkCheck } from "./types";

export interface CheckLinkOptions {
  signal?: AbortSignal;
  /** Per-request timeout in ms. Defaults to 8_000. */
  timeoutMs?: number;
  /** Max redirect hops to follow. Defaults to 10. */
  maxRedirects?: number;
  /** Retries on 429/5xx/network. Defaults to 1. */
  retries?: number;
  allowInsecureTls?: boolean;
  userAgent?: string;
  /** Base backoff in ms (jittered). Defaults to 300. */
  backoffBaseMs?: number;
  /** Upper bound on any honoured backoff / Retry-After. Defaults to 3_000. */
  maxBackoffMs?: number;
  /** Injectable sleep (tests). Defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
  /** Bytes of body to read for the soft-404 heuristic. Defaults to 16 KB. */
  softBodyBytes?: number;
}

const DEFAULTS = {
  timeoutMs: 8_000,
  maxRedirects: 10,
  retries: 1,
  backoffBaseMs: 300,
  maxBackoffMs: 3_000,
  softBodyBytes: 16 * 1024,
};

const NOT_FOUND_RE = /\b(not\s+found|page\s+doesn'?t\s+exist|404|no\s+such\s+page)\b/i;
const SOFT_404_BODY_LIMIT = 2_048;

interface ProbeOutcome {
  status: number;
  finalUrl: string;
  redirectChain: string[];
  reason?: FetchFailureReason;
  loop: boolean;
  body?: string;
  retryAfter?: string;
  method: "HEAD" | "GET";
}

/** Probe one URL and classify the result. Never throws. */
export async function checkLink(url: string, options: CheckLinkOptions = {}): Promise<LinkCheck> {
  const checkedAt = new Date().toISOString();
  const started = Date.now();

  const scheme = schemeOf(url);
  if (scheme !== "http" && scheme !== "https") {
    return {
      url,
      finalUrl: url,
      status: 0,
      verdict: "skipped",
      method: "GET",
      redirectChain: [],
      reason: scheme ? `unsupported scheme: ${scheme}` : "not a URL",
      checkedAt,
      durationMs: Date.now() - started,
    };
  }

  const outcome = await probeWithRetry(url, options);
  const softNotFound = isSoftNotFound(outcome);
  const verdict = classifyLink({
    status: outcome.status,
    redirected: outcome.redirectChain.length > 0,
    reason: outcome.reason,
    softNotFound,
    loop: outcome.loop,
  });

  return {
    url,
    finalUrl: outcome.finalUrl,
    status: outcome.status,
    verdict,
    method: outcome.method,
    redirectChain: outcome.redirectChain,
    reason: describeReason(outcome, softNotFound),
    checkedAt,
    durationMs: Date.now() - started,
  };
}

/**
 * A GET of exactly the URL to check, made earlier in the same run, that came
 * back without a redirect — what the audit's crawl has for every page it
 * fetched.
 */
export interface LinkAnswer {
  status: number;
  /** The body as received. Only the first `softBodyBytes` of it are read. */
  body: string;
  /** When the GET was made (ISO), and how long it took. */
  checkedAt: string;
  durationMs: number;
}

/**
 * The check a probe of `url` would produce, from an answer already in hand —
 * or `undefined` when only a probe can say.
 *
 * Only a 2xx qualifies. That is the case where the probe's outcome *is* the
 * GET's: HEAD answers 2xx, the GET follows for the soft-404 test, nothing is
 * retried, and the verdict comes from the GET's status and its first
 * `softBodyBytes`. It assumes the server answers HEAD as it answers GET, which
 * RFC 9110 §9.3.2 asks of it. A 3xx, 4xx or 5xx goes through
 * `probeWithHeadFallback` and its retries instead: there the outcome depends
 * on what HEAD said and on a second attempt, which no earlier GET can stand
 * in for.
 */
export function checkFromAnswer(
  url: string,
  answer: LinkAnswer,
  options: Pick<CheckLinkOptions, "softBodyBytes"> = {},
): LinkCheck | undefined {
  if (answer.status < 200 || answer.status >= 300) return undefined;
  const outcome: ProbeOutcome = {
    status: answer.status,
    finalUrl: url,
    redirectChain: [],
    loop: false,
    body: capText(answer.body, options.softBodyBytes ?? DEFAULTS.softBodyBytes),
    method: "GET",
  };
  const softNotFound = isSoftNotFound(outcome);
  return {
    url,
    finalUrl: url,
    status: outcome.status,
    verdict: classifyLink({
      status: outcome.status,
      redirected: false,
      softNotFound,
      loop: false,
    }),
    method: "GET",
    redirectChain: [],
    reason: describeReason(outcome, softNotFound),
    checkedAt: answer.checkedAt,
    durationMs: answer.durationMs,
  };
}

/** Run a probe, retrying once (configurable) on transient failures. */
async function probeWithRetry(url: string, options: CheckLinkOptions): Promise<ProbeOutcome> {
  const retries = options.retries ?? DEFAULTS.retries;
  const sleep = options.sleep ?? defaultSleep;
  let outcome = await probeWithHeadFallback(url, options);

  for (let attempt = 0; attempt < retries; attempt++) {
    if (!isTransient(outcome)) break;
    if (options.signal?.aborted) break;
    const delay = backoffDelay(outcome, attempt, options);
    if (delay > 0) await sleep(delay);
    outcome = await probeWithHeadFallback(url, options);
  }

  return outcome;
}

/**
 * HEAD first; fall back to GET when the server rejects HEAD or when we
 * need a body for the soft-404 heuristic on a 200.
 */
async function probeWithHeadFallback(
  url: string,
  options: CheckLinkOptions,
): Promise<ProbeOutcome> {
  const head = await followRedirects(url, "HEAD", options);
  if (headRejected(head) || (head.status >= 200 && head.status < 300)) {
    // HEAD was rejected, or HEAD succeeded but we want a body to rule out
    // a soft-404 — re-probe with GET.
    const get = await followRedirects(url, "GET", options);
    // If GET itself failed at the network level but HEAD had a real
    // status, trust HEAD (some hosts throttle GET more aggressively).
    if (get.status === 0 && head.status !== 0 && !headRejected(head)) return head;
    return get;
  }
  return head;
}

/** Whether a HEAD response indicates the server doesn't support HEAD. */
function headRejected(o: ProbeOutcome): boolean {
  return o.status === 405 || o.status === 501 || o.status === 403 || o.status === 0;
}

/**
 * Follow redirects manually so we can record the chain and detect loops.
 * Returns the terminal response or the looping/over-cap state.
 */
async function followRedirects(
  url: string,
  method: "HEAD" | "GET",
  options: CheckLinkOptions,
): Promise<ProbeOutcome> {
  const maxRedirects = options.maxRedirects ?? DEFAULTS.maxRedirects;
  const chain: string[] = [];
  const visited = new Set<string>([url]);
  let current = url;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await fetchUrl(current, {
      method,
      redirect: "manual",
      timeoutMs: options.timeoutMs ?? DEFAULTS.timeoutMs,
      allowInsecureTls: options.allowInsecureTls,
      userAgent: options.userAgent,
      maxBytes: method === "GET" ? (options.softBodyBytes ?? DEFAULTS.softBodyBytes) : undefined,
    });

    if (res.status === 0) {
      return {
        status: 0,
        finalUrl: current,
        redirectChain: chain,
        reason: res.reason,
        loop: false,
        method,
      };
    }

    const next = res.redirectChain[0];
    if (next) {
      chain.push(next);
      if (visited.has(next)) {
        return { status: res.status, finalUrl: next, redirectChain: chain, loop: true, method };
      }
      visited.add(next);
      current = next;
      continue;
    }

    return {
      status: res.status,
      finalUrl: res.finalUrl,
      redirectChain: chain,
      loop: false,
      body: res.body,
      retryAfter: res.retryAfter,
      method,
    };
  }

  // Exceeded the hop cap → treat as a loop / unresolved chain.
  return { status: 0, finalUrl: current, redirectChain: chain, loop: true, method };
}

function isSoftNotFound(o: ProbeOutcome): boolean {
  if (o.status < 200 || o.status >= 300) return false;
  if (o.body === undefined) return false;
  // A genuinely short body that announces "not found" — the classic
  // CMS soft-404 that returns 200 with an error page.
  if (o.body.length > SOFT_404_BODY_LIMIT) return false;
  return NOT_FOUND_RE.test(o.body);
}

function isTransient(o: ProbeOutcome): boolean {
  if (o.status === 0) return true; // network error
  if (o.status === 429) return true;
  if (o.status >= 500) return true;
  return false;
}

function backoffDelay(o: ProbeOutcome, attempt: number, options: CheckLinkOptions): number {
  const max = options.maxBackoffMs ?? DEFAULTS.maxBackoffMs;
  const retryAfterMs = parseRetryAfter(o.retryAfter);
  if (retryAfterMs !== undefined) return Math.min(retryAfterMs, max);
  const base = options.backoffBaseMs ?? DEFAULTS.backoffBaseMs;
  const exp = base * 2 ** attempt;
  const jitter = Math.floor(Math.random() * base);
  return Math.min(exp + jitter, max);
}

/** Parse a `Retry-After` header (delta-seconds or HTTP-date) into ms. */
function parseRetryAfter(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

function describeReason(o: ProbeOutcome, softNotFound: boolean): string | undefined {
  if (o.reason) return o.reason;
  if (o.loop) return "redirect loop";
  if (softNotFound) return "soft-404";
  if (o.status === 429) return "429 rate-limited";
  if (o.status === 403) return "403 forbidden";
  if (o.status >= 400) return `${o.status}`;
  return undefined;
}

function schemeOf(url: string): string | null {
  try {
    return new URL(url).protocol.replace(/:$/, "").toLowerCase();
  } catch {
    return null;
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
