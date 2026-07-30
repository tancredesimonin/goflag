/**
 * Stable finding fingerprints.
 *
 * Every finding in the report carries an `id` — a short, deterministic key
 * derived from the *identity* of the problem, not its transient details
 * (status codes, character counts, wording). This is what lets an agent (or
 * a CI baseline) say "finding `seo-1a2b3c4d5e` is still open" across runs,
 * and — because page URLs are normalized to origin-independent routes — even
 * across environments (localhost vs. staging vs. prod).
 *
 * Pure, no I/O. `createHash` is the only dependency.
 */

import { createHash } from "node:crypto";

/**
 * Normalize a same-origin URL to a stable, origin-independent route key so a
 * finding on `http://localhost:3000/en/about` and `https://site.com/en/about`
 * fingerprints the same. Drops the origin, collapses a trailing slash, keeps
 * the query string (it can change what page you get).
 */
export function routeKey(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${path}${u.search}`;
  } catch {
    return rawUrl;
  }
}

/**
 * Normalize a link target for fingerprinting. Unlike {@link routeKey} this
 * keeps the origin, because a broken link's identity includes *where* it
 * points (two different external hosts are two different findings). Only the
 * trailing slash is normalized away.
 */
export function targetKey(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.origin}${path}${u.search}`;
  } catch {
    return rawUrl;
  }
}

/**
 * Build a finding id: `<category>-<10 hex chars>`. The parts are joined with
 * a NUL separator (which can't appear in a URL or rule id) before hashing, so
 * distinct tuples never collide by concatenation.
 */
export function fingerprint(category: string, ...parts: string[]): string {
  const digest = createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 10);
  return `${category}-${digest}`;
}
