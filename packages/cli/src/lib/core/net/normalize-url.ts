/**
 * Result of normalizing a user-supplied URL string. Either a usable absolute
 * http(s) URL, or a flag that the input could not be coerced into one.
 */
export type NormalizeUrlResult = { ok: true; url: string } | { ok: false };

// Matches a leading `scheme://` (e.g. `http://`, `https://`, `ftp://`). Used to
// tell "the user already typed a scheme" apart from a bare host like
// `tancrede.eu` or `localhost:3000`.
const SCHEME_PATTERN = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//;

/**
 * Coerce a user-typed location into an absolute http(s) URL.
 *
 * People rarely type the scheme — they paste `tancrede.eu` or
 * `example.com/blog`. We treat a missing scheme as `https://` so the form
 * "just works", while still rejecting genuinely unusable input (empty
 * strings, non-http(s) schemes, or anything the URL parser can't make sense
 * of). The returned URL preserves the path/query the user typed; we only
 * prepend the scheme when one is absent.
 */
export function normalizeInputUrl(input: string): NormalizeUrlResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false };

  const schemeMatch = trimmed.match(SCHEME_PATTERN);
  let candidate: string;
  if (schemeMatch) {
    const scheme = (schemeMatch[1] ?? "").toLowerCase();
    // A scheme was supplied explicitly — only http/https are inspectable.
    if (scheme !== "http" && scheme !== "https") return { ok: false };
    candidate = trimmed;
  } else {
    // No scheme: assume https. This is the whole point — `tancrede.eu`
    // becomes `https://tancrede.eu`.
    candidate = `https://${trimmed}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { ok: false };
  if (!parsed.hostname) return { ok: false };

  return { ok: true, url: candidate };
}
