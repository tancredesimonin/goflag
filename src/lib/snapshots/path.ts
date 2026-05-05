/**
 * Dotted-path matcher for `config.normalize` rules.
 *
 * Supports a tiny subset of glob syntax — the only pieces we
 * actually need to address fields inside a `Snapshot`:
 *
 *   - Literal segments separated by `.`           e.g. `"meta:description"`
 *   - `*`  wildcard, single segment                e.g. `"jsonld.*.fields"`
 *   - `**` wildcard, any number of segments        e.g. `"jsonld.**"`
 *   - `[*]` array element wildcard                 e.g. `"tags[*].value"`
 *
 * Anything else (regex, brace expansion, character classes) is
 * out of scope on purpose — we deliberately want config files to
 * be readable at a glance.
 */

/**
 * `true` when `path` matches `pattern` under the syntax above.
 *
 * Both inputs are case-sensitive and treated as opaque strings; we
 * do not URL- or HTML-decode either side. The caller is responsible
 * for passing the path in the same form the projection produced
 * (e.g. `"tags[3].value"`, `"jsonld[0].fields[*]"`).
 */
export function matchesPath(pattern: string, path: string): boolean {
  if (pattern === path) return true;
  const re = compilePattern(pattern);
  return re.test(path);
}

/**
 * Compile a glob pattern into a regular expression. Exposed for tests
 * (so we can assert on the compiled shape) and reused by `matchesPath`.
 */
export function compilePattern(pattern: string): RegExp {
  let source = "^";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*" && pattern[i + 1] === "*") {
      // `**` — match any number of path segments (including zero).
      source += ".*";
      i += 2;
      continue;
    }
    if (ch === "*") {
      // `*` — match anything except a path separator. We treat `.`,
      // `:`, `[`, and `]` as separators so a wildcard cannot
      // accidentally gobble across nested fields. (`:` separates
      // tag key segments like `meta:og:image`; `.` separates
      // jsonld field paths; brackets fence array indices.)
      source += "[^.:\\[\\]]*";
      i += 1;
      continue;
    }
    if (ch === "[" && pattern[i + 1] === "*" && pattern[i + 2] === "]") {
      // `[*]` — array element wildcard. Matches any non-empty index.
      source += "\\[[^\\]]+\\]";
      i += 3;
      continue;
    }
    // Anything else is a literal char; escape regex specials.
    // (`ch` is always defined inside the bounds check above.)
    source += escapeRegExp(ch as string);
    i += 1;
  }
  source += "$";
  return new RegExp(source);
}

function escapeRegExp(ch: string): string {
  // No `^`, `$`, `|`, `(`, `)` — those are reserved for our own
  // compiler output above. Everything else gets a backslash.
  return ch.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}
