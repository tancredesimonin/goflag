/**
 * A minimal `llms.txt` reader — goflag's own code, not a dependency.
 *
 * Checked on 2026-10-05: npm has no maintained parser to reach for. The three
 * candidates were `@25xcodes/llmstxt-parser` (8 downloads a week, one
 * maintainer), `llms-txt-parser` (3 a week, untouched since June 2025) and
 * `llmstxt`, which is a sitemap-to-llms.txt generator rather than a reader.
 * The proposal's own JavaScript is a demo page, not a package. Adding a runtime
 * dependency to `@goflag/cli` for any of them would trade forty lines for a
 * supply-chain entry nobody maintains.
 *
 * So this reads the two things the rules ask about, and nothing else:
 *
 * - **the first H1**, which https://llmstxt.org calls "the only required
 *   section". ATX only (`# Name`), as CommonMark spells it — a space after the
 *   `#`, up to three spaces of indent. The proposal's reference parser reads
 *   `^#` too; a setext heading (`Name` over `====`) is valid markdown that it
 *   would not find either, so goflag does not pretend to.
 * - **every inline link** `[name](url)`, resolved against the file's URL. Not
 *   just the list entries under an H2: a link in the summary or the details is
 *   as much a promise to an agent as one in a file list, and telling them apart
 *   would be section parsing this file has no use for.
 *
 * Fenced code blocks and inline code spans are skipped, because an example of
 * the format — the proposal's own page has one — is not a claim about the site.
 */

import type { LlmsTxtLink } from "../types";

export interface LlmsTxtParse {
  h1?: { text: string; line: number };
  links: LlmsTxtLink[];
}

/** `# Name` — one `#`, then whitespace or the end of the line. */
const H1 = /^ {0,3}#(?:[ \t]+(.*?))?[ \t]*#*[ \t]*$/;

/** A fence opens and closes with three or more backticks or tildes. */
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * `[name](url)` and `[name](url "title")`, angle brackets allowed around the
 * destination. Not preceded by `!`, which would make it an image.
 */
const LINK = /(!?)\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;

/**
 * Read an llms.txt body.
 *
 * Never throws. A link whose destination does not resolve to an http(s) URL —
 * `mailto:`, a typo — is dropped rather than reported: the rules ask whether a
 * listed URL answers, and a destination that is not a URL is not one.
 */
export function parseLlmsTxt(body: string, fileUrl: string): LlmsTxtParse {
  const lines = body.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/);
  const links: LlmsTxtLink[] = [];
  let h1: LlmsTxtParse["h1"];
  let fence: string | undefined;

  for (const [index, raw] of lines.entries()) {
    const line = index + 1;

    const fenceMatch = FENCE.exec(raw);
    if (fenceMatch) {
      const marker = fenceMatch[1]!;
      if (fence === undefined) fence = marker;
      // A fence closes on a run of the same character at least as long.
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = undefined;
      continue;
    }
    if (fence !== undefined) continue;

    if (!h1) {
      const heading = H1.exec(raw);
      const text = heading?.[1]?.trim();
      if (text) h1 = { text, line };
    }

    const prose = raw.replace(/`[^`]*`/g, "");
    for (const match of prose.matchAll(LINK)) {
      if (match[1] === "!") continue;
      const url = resolve(match[3]!, fileUrl);
      if (url) links.push({ name: match[2]!.trim(), url, line });
    }
  }

  return { ...(h1 ? { h1 } : {}), links };
}

/**
 * Whether a body opens like an HTML document.
 *
 * Read from the bytes, not from `content-type`, because the two answer
 * different questions: a markdown file served as `text/html` is an llms.txt
 * with the wrong header, and a home page served at `/llms.txt` is no llms.txt
 * at all. Only the second is the catch-all route `http.not-found` reports.
 */
export function looksLikeHtml(body: string): boolean {
  return /^(?:<!doctype\s+html|<html[\s>])/i.test(body.replace(/^\uFEFF/, "").trimStart());
}

function resolve(href: string, base: string): string | undefined {
  try {
    const url = new URL(href, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}
