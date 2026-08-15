import { parseRobots } from "../robots/parse";
import type { RobotsProbe } from "../types";
import { combineSignals } from "./abort";

export interface RobotsProbeOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Fetch and parse the origin's robots.txt.
 *
 * The two questions the engine used to ask — where are the sitemaps, does this
 * block everything — are now two readings of one parse
 * (`docs/sitemap-robots-plan.md` §3.1), so a rule can also ask about a typo on
 * line 14 or a directive nobody implements.
 *
 * A failure is not the same as an absence, and the shape says so: a 404 is
 * `found: false` with an empty parse, which RFC 9309 §2.3.1.3 reads as "allow
 * everything". A 5xx or a network error is also `found: false` but keeps its
 * status, because §2.3.1.4 says a crawler must then assume the opposite —
 * complete disallow — and `robotstxt.unreachable` is the rule that says so.
 */
export async function probeRobots(
  origin: string,
  options: RobotsProbeOptions = {},
): Promise<RobotsProbe> {
  const url = new URL("/robots.txt", origin).toString();
  const { signal, cleanup } = combineSignals(options.signal, options.timeoutMs ?? 5_000);
  const empty = { groups: [], sitemaps: [], invalidLines: [], unknownDirectives: [] };
  const noRedirect = { count: 0, finalUrl: url, crossOrigin: false };

  try {
    const res = await fetch(url, { signal, redirect: "follow" });

    // `fetch` does not report the hop count, but it does report where it
    // landed — which is the part a rule can act on. A different origin is the
    // proxy accident `robotstxt.cross-origin` exists for.
    const redirected = res.url !== url;
    const redirects = {
      count: redirected ? 1 : 0,
      finalUrl: res.url || url,
      crossOrigin: redirected && !sameOrigin(res.url, url),
    };

    if (!res.ok) {
      return { url, status: res.status, found: false, byteLength: 0, redirects, ...empty };
    }

    const raw = await res.text();
    return {
      url,
      status: res.status,
      found: true,
      raw,
      byteLength: Buffer.byteLength(raw, "utf8"),
      redirects,
      ...parseRobots(raw),
    };
  } catch {
    return { url, status: 0, found: false, byteLength: 0, redirects: noRedirect, ...empty };
  } finally {
    cleanup();
  }
}

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return true;
  }
}
