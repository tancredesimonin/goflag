/**
 * Codes ICU knows but a site must never declare.
 *
 * Found by probing rather than assumed: `Intl.DisplayNames` answers
 * `"Unknown Region"` for `ZZ` instead of `undefined`, because `ZZ` is a real
 * CLDR code *meaning* unknown. An existence check that trusted ICU alone would
 * therefore accept `pt-ZZ` — the exact tag this library exists to refuse.
 */

/** `und` already answers `undefined`; these two do not. */
export const EXCLUDED_LANGUAGES = new Set(["mul", "zxx", "und", "mis"]);

/**
 * `ZZ` means "unknown"; `XA` and `XB` are ICU's pseudo-locales for testing.
 *
 * `EU`, `QO` and the numeric M.49 groupings stay: they are real macro-regions,
 * and Google documents `es-419`.
 */
export const EXCLUDED_REGIONS = new Set(["ZZ", "XA", "XB"]);
