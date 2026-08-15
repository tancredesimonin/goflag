/**
 * The RFC 9309 matcher: does this robots.txt allow this path?
 *
 * A pure function over a parsed file, shared by every rule that asks the
 * question — `robots.blocks-page` today, `sitemap.entry.blocked-by-robots`
 * when the sitemap half of `docs/sitemap-robots-plan.md` lands, and the
 * crawler itself if it ever learns to obey what it now fully reads.
 *
 * The semantics are small in number and easy to get subtly wrong, so each has
 * a dedicated test in `./match.test.ts`:
 *
 * | Behaviour         | RFC 9309                                                |
 * | ----------------- | ------------------------------------------------------- |
 * | Group selection   | most specific matching `User-agent`, else `*`           |
 * | Rule precedence   | longest match by octets wins; a tie goes to `allow`     |
 * | Wildcards         | `*` any sequence, `$` end anchor (§2.2.3)               |
 * | Percent-encoding  | compare octets — encoded and bare forms are equivalent  |
 * | Case              | paths are case-sensitive, user-agents are not           |
 * | Empty `Disallow:` | allows everything, and is not a defect                  |
 *
 * The one judgement call: **an empty pattern never matches.** RFC 9309 gives
 * `Disallow:` with no value the meaning "allow everything", which is the same
 * outcome as the rule not existing — so it is dropped rather than treated as a
 * zero-length prefix that would match every path and, being length 0, always
 * lose anyway.
 */

import type { RobotsGroup, RobotsRule } from "../types";

export interface RobotsDecision {
  allowed: boolean;
  /** The rule that decided, absent when nothing matched (allow by default). */
  rule?: RobotsRule;
  /** Which group's rules were consulted; `*` or a product token. */
  group?: string;
}

/**
 * Decide whether `path` may be fetched by `userAgent`.
 *
 * `path` is the URL's path plus query — what the protocol matches against —
 * and callers pass it already in the form the server would see.
 */
export function robotsAllows(
  groups: readonly RobotsGroup[],
  path: string,
  userAgent = "*",
): RobotsDecision {
  const group = selectGroup(groups, userAgent);
  // No group applies: nothing forbids anything. §2.2.1 — a file that names
  // only `Googlebot` says nothing at all about anyone else.
  if (!group) return { allowed: true };

  const token = group.userAgents[0]?.value ?? "*";

  let best: RobotsRule | undefined;
  let bestLength = -1;
  for (const rule of group.rules) {
    if (rule.pattern.length === 0) continue;
    if (!patternMatches(rule.pattern, path)) continue;

    const length = octetLength(rule.pattern);
    if (length > bestLength) {
      best = rule;
      bestLength = length;
      continue;
    }
    // §2.2.2: equal length is a tie, and `allow` wins it.
    if (length === bestLength && rule.kind === "allow") best = rule;
  }

  if (!best) return { allowed: true, group: token };
  return { allowed: best.kind === "allow", rule: best, group: token };
}

/**
 * The group whose rules apply: the most specific matching `User-agent`,
 * falling back to `*`.
 *
 * "Most specific" is the longest matching product token — a file with both
 * `Googlebot` and `Googlebot-Image` says different things to each. Duplicate
 * groups for one token are merged, because a file that names the same agent
 * twice means the union and crawlers read it that way.
 */
function selectGroup(groups: readonly RobotsGroup[], userAgent: string): RobotsGroup | undefined {
  const wanted = userAgent.trim().toLowerCase();

  let bestToken: string | undefined;
  for (const group of groups) {
    for (const agent of group.userAgents) {
      if (agent.value === "*") continue;
      // A product token matches when it is a prefix of the crawler's name:
      // `Googlebot` answers for `Googlebot/2.1`.
      if (!wanted.startsWith(agent.value)) continue;
      if (bestToken === undefined || agent.value.length > bestToken.length) {
        bestToken = agent.value;
      }
    }
  }

  const token = bestToken ?? "*";
  const matching = groups.filter((group) =>
    group.userAgents.some((agent) => agent.value === token),
  );
  if (matching.length === 0) return undefined;
  if (matching.length === 1) return matching[0];

  return {
    userAgents: matching.flatMap((group) => group.userAgents),
    rules: matching.flatMap((group) => group.rules),
  };
}

/**
 * Whether a pattern matches a path, with `*` and `$`.
 *
 * Built as a regular expression over the **normalized** forms of both, so
 * `/caf%C3%A9` and `/café` are one path written two ways. Everything that is
 * not a wildcard is escaped, so a pattern containing `.` or `+` means those
 * characters and not their regex meanings.
 */
function patternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;

  const source = body
    .split("*")
    .map((literal) => escapeRegExp(normalizeOctets(literal)))
    .join(".*");

  return new RegExp(`^${source}${anchored ? "$" : ""}`).test(normalizeOctets(path));
}

/**
 * Decode percent-escapes so two spellings of one path compare equal.
 *
 * RFC 9309 says to compare octets, and a server that serves `/café` serves it
 * for `/caf%C3%A9` too. Undecodable input is returned as it came: a malformed
 * escape is not a reason to refuse an answer.
 */
function normalizeOctets(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Pattern length in octets, which is what §2.2.2 compares. */
function octetLength(pattern: string): number {
  return Buffer.byteLength(normalizeOctets(pattern), "utf8");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
