/**
 * The two fingerprint comparisons `ci/baseline.mdx` explains in prose, computed.
 *
 * The page makes a claim a reader has to take on trust and cannot check: the
 * same metadata finding keeps its identity across origins, and the same broken
 * link does not. It is the first cause of "my baseline reddened and nothing
 * moved", and it is the reason the merge-request job works at all.
 *
 * Showing it means showing ids, and an id written by hand is a number a reader
 * would be right not to believe. So they are computed here, by the functions
 * the engine uses (`report/fingerprint.ts`), and the site reads the result —
 * invariant I3 forbids it from calling them itself, exactly as it forbids it
 * from calling the renderers.
 *
 * Every argument below is the argument `build.ts` passes, cited by line. That
 * is the part worth checking in review: if these calls drift from the real
 * ones, the figure demonstrates a scheme goflag does not use.
 */

import { fingerprint, routeKey, targetKey } from "../src/report/fingerprint";

/**
 * The two environments the documentation names — production, and the localhost
 * a `--start` job audits on a branch.
 */
const PROD = "https://example.com";
const LOCAL = "http://localhost:3000";

const PAGE = "/about";
const DEAD = "/team";

export interface FingerprintCase {
  /** What is being fingerprinted, in the page's words. */
  finding: string;
  /** The call, spelled out, so the figure can show what went in. */
  parts: readonly string[];
  /** The id, per origin, keyed by the origin it was computed from. */
  ids: Readonly<Record<string, string>>;
  /** Whether the two origins agree. */
  stable: boolean;
  /**
   * The one sentence that says why.
   *
   * Plain prose, no backticks: this ends up in a React node rather than in
   * markdown, so a backtick would render as a backtick.
   */
  why: string;
}

/** `build.ts:710` — an SEO finding: rule, route, occurrence. No origin. */
const seoCase: FingerprintCase = {
  finding: "title.missing on /about",
  parts: ["seo", "title.missing", "routeKey(page)", "occurrence"],
  ids: Object.fromEntries(
    [PROD, LOCAL].map((origin) => [
      origin,
      fingerprint("seo", "title.missing", routeKey(`${origin}${PAGE}`), String(0)),
    ]),
  ),
  stable: true,
  why: "routeKey drops the origin, so the same defect on the same route is one finding wherever it is audited.",
};

/** `build.ts:930` — a broken link: route, and the target *with* its origin. */
const linkCase: FingerprintCase = {
  finding: "a dead internal link on /about",
  parts: ["link", "routeKey(page)", "targetKey(target)"],
  ids: Object.fromEntries(
    [PROD, LOCAL].map((origin) => [
      origin,
      fingerprint("link", routeKey(`${origin}${PAGE}`), targetKey(`${origin}${DEAD}`)),
    ]),
  ),
  stable: false,
  why: "targetKey keeps the origin, because two hosts are two different targets — so a baseline taken on production re-proposes every internal link when it is compared against a localhost run.",
};

export const FINGERPRINT_CASES: readonly FingerprintCase[] = [seoCase, linkCase];

export interface FingerprintFixture {
  origins: readonly string[];
  page: string;
  target: string;
  cases: readonly FingerprintCase[];
}

export function buildFingerprintFixture(): FingerprintFixture {
  return { origins: [PROD, LOCAL], page: PAGE, target: DEAD, cases: FINGERPRINT_CASES };
}
