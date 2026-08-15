/**
 * A robots.txt parser that keeps what it could not understand.
 *
 * The engine has had two ad-hoc readers of this file — a regex for `Sitemap:`
 * lines and a line-walk looking for `Disallow: /` — each answering exactly one
 * question and throwing the rest away. That is why goflag can say "this site
 * blocks everything" and nothing else about a file that is frequently where a
 * site's whole indexing story goes wrong.
 *
 * `docs/sitemap-robots-plan.md` §3.1 asks for the opposite: a parse that keeps
 * everything, **including the lines it rejected**, because "there is a typo on
 * line 14" is a finding and a boolean cannot carry it. Every record therefore
 * carries its line number.
 *
 * RFC 9309 is the reference throughout. The parts that matter here:
 *
 * - §2.2.1 a group is one or more `User-agent` lines followed by rules; a
 *   `User-agent` line after a rule line starts a **new** group.
 * - §2.2.4 `Sitemap:` is independent of groups — it belongs to the file, not
 *   to whichever group it happens to sit in.
 * - §2.2.2 an empty `Disallow:` is valid and allows everything.
 * - Comments run from `#` to end of line, anywhere.
 */

import type { RobotsGroup, RobotsInvalidLine, RobotsParse } from "../types";

/** Directives that are part of the standard and belong to a group. */
const RULE_DIRECTIVES = new Set(["allow", "disallow"]);

/**
 * Directives that are not in RFC 9309 but appear often enough that calling
 * them typos would be wrong. Recognised so a rule can say "this is ignored"
 * rather than "this is broken" — two different things to tell a reader.
 */
const KNOWN_EXTENSIONS = new Set(["crawl-delay", "host", "clean-param", "request-rate", "noindex"]);

/**
 * Parse a robots.txt body.
 *
 * Never throws and never rejects a file wholesale: a robots.txt that is half
 * garbage still has a working half, and a crawler would use it. Lines that
 * parse as nothing are collected rather than dropped.
 */
export function parseRobots(body: string): RobotsParse {
  const groups: RobotsGroup[] = [];
  const sitemaps: Array<{ value: string; line: number }> = [];
  const invalidLines: RobotsInvalidLine[] = [];
  const unknownDirectives: Array<{ name: string; line: number }> = [];

  /** The group being filled, and whether it has taken a rule yet. */
  let current: RobotsGroup | undefined;
  let currentTookRule = false;

  const lines = body.split(/\r\n|\r|\n/);

  for (const [index, rawLine] of lines.entries()) {
    const line = index + 1;
    const withoutComment = rawLine.replace(/#.*$/, "");
    const trimmed = withoutComment.trim();
    if (trimmed.length === 0) continue;

    const separator = trimmed.indexOf(":");
    if (separator === -1) {
      invalidLines.push({ line, raw: rawLine, reason: "no `:` separator" });
      continue;
    }

    const name = trimmed.slice(0, separator).trim().toLowerCase();
    const value = trimmed.slice(separator + 1).trim();

    if (name === "user-agent") {
      if (value.length === 0) {
        invalidLines.push({ line, raw: rawLine, reason: "empty `User-agent`" });
        continue;
      }
      // §2.2.1: consecutive `User-agent` lines share one group; one that
      // follows a rule opens a new group instead.
      if (!current || currentTookRule) {
        current = { userAgents: [], rules: [] };
        groups.push(current);
        currentTookRule = false;
      }
      current.userAgents.push({ value: value.toLowerCase(), line });
      continue;
    }

    if (name === "sitemap") {
      // §2.2.4: independent of groups, so it does not close or open one.
      if (value.length === 0) {
        invalidLines.push({ line, raw: rawLine, reason: "empty `Sitemap`" });
        continue;
      }
      sitemaps.push({ value, line });
      continue;
    }

    if (RULE_DIRECTIVES.has(name)) {
      if (!current) {
        // A rule with no group above it governs nobody. Crawlers drop it, and
        // the author almost certainly did not mean that.
        invalidLines.push({
          line,
          raw: rawLine,
          reason: `\`${name}\` before any \`User-agent\` group`,
        });
        continue;
      }
      current.rules.push({ kind: name as "allow" | "disallow", pattern: value, line });
      currentTookRule = true;
      continue;
    }

    if (KNOWN_EXTENSIONS.has(name)) {
      unknownDirectives.push({ name, line });
      continue;
    }

    invalidLines.push({ line, raw: rawLine, reason: `unknown directive \`${name}\`` });
  }

  return { groups, sitemaps, invalidLines, unknownDirectives };
}
