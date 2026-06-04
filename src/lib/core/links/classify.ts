/**
 * Verdict classification for the link checker.
 *
 * Turning a raw `(status, reason)` pair into a `LinkVerdict` is where a
 * credible link checker earns trust: the goal is to *avoid false
 * positives*. Redirects are a signal, not a breakage; anti-bot 403/429
 * are triaged separately from genuine 4xx/5xx; soft-404s are flagged,
 * never silently passed.
 */

import type { FetchFailureReason } from "../net/fetch-url";
import type { LinkVerdict } from "./types";

export interface ClassifyInput {
  /** Final HTTP status; `0` for a network failure. */
  status: number;
  /** True when at least one redirect hop was followed. */
  redirected: boolean;
  /** Network failure reason, when `status === 0`. */
  reason?: FetchFailureReason;
  /** Soft-404 heuristic tripped (200 body that says "not found"). */
  softNotFound?: boolean;
  /** A redirect loop or hop-cap was hit. */
  loop?: boolean;
}

/**
 * Map a check outcome onto a verdict. Pure and deterministic.
 *
 *   - network error / redirect loop          → broken
 *   - soft-404                               → warning
 *   - 403 / 429                              → blocked (likely anti-bot)
 *   - any other 4xx / 5xx                    → broken
 *   - 2xx after a redirect                   → redirect
 *   - 2xx with no redirect                   → ok
 *   - anything else (1xx, 3xx with no 2xx)   → broken
 */
export function classifyLink(input: ClassifyInput): LinkVerdict {
  if (input.status === 0) return "broken";
  if (input.loop) return "broken";
  if (input.softNotFound) return "warning";
  if (input.status === 403 || input.status === 429) return "blocked";
  if (input.status >= 400) return "broken";
  if (input.status >= 200 && input.status < 300) {
    return input.redirected ? "redirect" : "ok";
  }
  // 1xx, or a 3xx that never resolved to a 2xx.
  return "broken";
}
