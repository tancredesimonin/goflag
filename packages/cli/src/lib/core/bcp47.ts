/**
 * Language tags, judged as an auditor judges them.
 *
 * `locale.invalid` used to be a shape check — two or three letters, optionally
 * a region — and it was wrong in both directions at once (plan §B.5):
 *
 *   isValidLocale("qq")       → true    invented language, reported as fine
 *   isValidLocale("pt-ZZ")    → true    "unknown region", reported as fine
 *   isValidLocale("zh-Hant")  → false   real tag, reported as a defect
 *
 * The second column is the one that matters. A rule named `locale.invalid`
 * that accepts an invented tag does not keep its promise, and one that rejects
 * every Chinese or Serbian site is the failure an auditor can least afford.
 *
 * The data comes from ICU, which is in Node — no table, no dependency. It is
 * the same source `@goflag/next` reads, deliberately through a separate
 * implementation: the plan (§B.1) keeps the producer and the auditor as two
 * witnesses, because a shared validator would make their agreement prove
 * nothing. Their severities differ and are meant to. The library refuses a
 * script subtag it has no use for; the auditor accepts `zh-Hant`, because a
 * site is entitled to serve it.
 */

const languageNames = new Intl.DisplayNames(["en"], { type: "language", fallback: "none" });
const regionNames = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
const scriptNames = new Intl.DisplayNames(["en"], { type: "script", fallback: "none" });

/**
 * Codes ICU knows and an hreflang value must still not carry.
 *
 * `ZZ` is a real CLDR code *meaning* unknown, so an existence check that
 * trusted ICU alone would accept `pt-ZZ` — the exact tag this rule exists to
 * catch. `XA` and `XB` are ICU's pseudo-locales for testing. The macro-regions
 * stay: `es-419` is documented by Google and serves real audiences.
 */
const NOT_AN_AUDIENCE_REGION = new Set(["ZZ", "XA", "XB"]);

/** Language codes that name the absence of a language rather than one. */
const NOT_AN_AUDIENCE_LANGUAGE = new Set(["mul", "zxx", "und", "mis"]);

/** `Zzzz` is CLDR's "unknown script", the script-level equivalent of `ZZ`. */
const NOT_A_SCRIPT = new Set(["Zzzz"]);

/**
 * Whether this runtime can tell a real tag from an invented one.
 *
 * Node has shipped full ICU by default since v13, but a `small-icu` build
 * carries English alone and answers `undefined` for languages that exist. The
 * library throws on such a runtime; an auditor must not. Judging somebody
 * else's site, the worst outcome is a page full of `locale.invalid` findings
 * that are all false, so the probe degrades to the old shape check instead —
 * and says so, once, in `diagnostics.warnings`, because a check that quietly
 * stopped checking is what the coverage and unreachable-page work already
 * taught this codebase not to ship.
 */
export const ICU_KNOWS_LANGUAGES: boolean =
  languageNames.of("fr") !== undefined &&
  languageNames.of("qq") === undefined &&
  regionNames.of("BR") !== undefined;

/** The message `diagnostics.warnings` carries when the probe is unavailable. */
export const ICU_UNAVAILABLE_WARNING =
  "This Node build cannot tell a real language tag from an invented one " +
  "(small-icu). hreflang tags were checked for shape only, so `locale.invalid` " +
  "may have missed tags that do not exist.";

/** Shape only: what the rule checked before ICU, and its fallback since. */
const BCP47_SHAPE = /^[a-z]{2,3}(-[a-z]{2}|-\d{3})?$/i;

/** True when a URL path segment looks like a locale tag (`/fr`, `/pt-br`, …). */
export function looksLikeLocaleSegment(segment: string): boolean {
  return BCP47_SHAPE.test(segment);
}

/**
 * True when `tag` is a language tag a site may legitimately declare.
 *
 * Structure is answered by `Intl.getCanonicalLocales`, which rejects `pt_BR`
 * and `en--US` — the malformations that actually appear in the wild — and
 * accepts variants and extensions, which are valid and none of this rule's
 * business. Existence is then checked subtag by subtag: an unknown language,
 * region or script is what makes a well-formed tag a dead one.
 */
export function isValidLocale(tag: string): boolean {
  if (tag === "x-default") return true;
  if (!ICU_KNOWS_LANGUAGES) return BCP47_SHAPE.test(tag);

  let canonical: string;
  try {
    canonical = Intl.getCanonicalLocales(tag)[0] ?? "";
  } catch {
    return false;
  }
  if (!canonical) return false;

  let parts: Intl.Locale;
  try {
    parts = new Intl.Locale(canonical);
  } catch {
    return false;
  }

  // `language` is typed as a string but is absent on a tag that carries no
  // primary subtag — `und`, and the grandfathered forms. A tag naming no
  // language names no audience.
  const language = (parts.language ?? "").toLowerCase();
  if (!language) return false;
  if (NOT_AN_AUDIENCE_LANGUAGE.has(language)) return false;
  if (languageNames.of(language) === undefined) return false;

  if (parts.script) {
    if (NOT_A_SCRIPT.has(parts.script)) return false;
    if (scriptNames.of(parts.script) === undefined) return false;
  }

  if (parts.region) {
    if (NOT_AN_AUDIENCE_REGION.has(parts.region)) return false;
    if (regionNames.of(parts.region) === undefined) return false;
  }

  return true;
}

/**
 * True when the primary subtag names a language ICU knows.
 *
 * Used for the candidate evidence behind a locale axis goflag refuses to
 * guess, where the question is "could this path segment plausibly be a
 * language?" rather than "is this tag valid?". It replaces a hand-written
 * ISO 639-1 list, which the plan (§B.5) noted becomes deletable the moment the
 * probe exists — and which was stale by construction, since it could only ever
 * be as current as the day somebody typed it.
 */
export function isKnownLanguageTag(tag: string): boolean {
  const primary = (tag.toLowerCase().split("-")[0] ?? "").trim();
  if (!primary) return false;
  if (NOT_AN_AUDIENCE_LANGUAGE.has(primary)) return false;
  if (!ICU_KNOWS_LANGUAGES) return BCP47_SHAPE.test(primary);
  return languageNames.of(primary) !== undefined;
}
