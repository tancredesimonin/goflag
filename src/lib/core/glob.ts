/**
 * Tiny glob-to-regex matcher used by the Phase 7 crawler include /
 * exclude filters.
 *
 * Supports the small subset of patterns Goflag actually advertises:
 *
 *   - `*`   matches any run of characters, NOT crossing `/`
 *   - `**`  matches any run of characters, including `/`
 *   - `?`   matches a single character (not `/`)
 *   - everything else is literal
 *
 * No brace expansion, no character classes, no negation. The matcher
 * is anchored: `*.html` only matches `*.html`, not `/foo.html`. Add a
 * leading `**` (`**.html`) when you actually want a "any path ending
 * in .html" filter.
 *
 * Patterns are pre-compiled to RegExps so the BFS hot loop only runs
 * `RegExp.test` per candidate instead of re-tokenising on every check.
 */

const cache = new Map<string, RegExp>();

export function compileGlob(pattern: string): RegExp {
  const cached = cache.get(pattern);
  if (cached) return cached;
  let re = "^";
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i]!;
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        re += ".*";
        i += 2;
        continue;
      }
      re += "[^/]*";
      i += 1;
      continue;
    }
    if (c === "?") {
      re += "[^/]";
      i += 1;
      continue;
    }
    if (/[.+^${}()|\\[\]\/]/.test(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
    i += 1;
  }
  re += "$";
  const compiled = new RegExp(re);
  cache.set(pattern, compiled);
  return compiled;
}

export function matchesAny(value: string, patterns: string[]): boolean {
  for (const p of patterns) {
    if (compileGlob(p).test(value)) return true;
  }
  return false;
}
