import { EXCLUDED_LANGUAGES, EXCLUDED_REGIONS } from "./excluded";
import type { Language, Region } from "./generated";

/**
 * Language tags, answered by ICU rather than by a table.
 *
 * Everything here delegates to `Intl`, which is part of the Node runtime — so
 * the package still has no dependency (invariant I1), and the data is
 * maintained by whoever ships the ICU inside your Node rather than by us.
 *
 *   Intl.getCanonicalLocales("pt-br")   → "pt-BR"       the casing
 *   new Intl.Locale("pt").maximize()    → pt-Latn-BR    the likely subtags
 *   DisplayNames(fallback:"none")       → undefined     existence
 *
 * The literal unions in `generated.ts` come from the same source, enumerated by
 * a script, so the compile-time and run-time answers cannot diverge.
 */

export type { Language, Region };

/**
 * A tag this library will emit: a known language, optionally a known region.
 *
 * Validation is a conditional type over the literal you wrote, not a
 * precomputed union: enumerating every language-region pair is ~58,000 members,
 * which compiles and makes every error message unreadable.
 */
export type ValidTag<T extends string> = T extends `${infer L}-${infer R}`
  ? Lowercase<L> extends Language
    ? Uppercase<R> extends Region
      ? T
      : never
    : never
  : Lowercase<T> extends Language
    ? T
    : never;

const languageNames = new Intl.DisplayNames(["en"], { type: "language", fallback: "none" });
const regionNames = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });

/**
 * Node has shipped full ICU by default since v13, but a `small-icu` build
 * carries English alone and would answer differently — accepting everything,
 * silently. Missing data must not read as "every tag is valid", so it is
 * probed once, here, and fails loudly.
 */
function assertIcu(): void {
  if (languageNames.of("fr") === undefined || languageNames.of("qq") !== undefined) {
    throw new Error(
      "@goflag/next needs a Node built with full ICU: Intl.DisplayNames cannot " +
        "tell a real language from an invented one in this runtime.",
    );
  }
}
assertIcu();

/** True when ICU knows this language subtag and it means an actual language. */
export function isLanguage(code: string): boolean {
  const lower = code.toLowerCase();
  return !EXCLUDED_LANGUAGES.has(lower) && languageNames.of(lower) !== undefined;
}

/** True when ICU knows this region subtag and it means an actual place. */
export function isRegion(code: string): boolean {
  const upper = code.toUpperCase();
  return !EXCLUDED_REGIONS.has(upper) && regionNames.of(upper) !== undefined;
}

/**
 * Fold a tag to the form used as an identity key.
 *
 * BCP 47 §2.1.1 makes tags case-insensitive and says the conventional
 * capitalisation "MUST NOT be taken to carry meaning". `pt-BR` and `pt-br` are
 * one locale, and anything comparing them must agree with that.
 */
export function localeIdentity(tag: string): string {
  return tag.trim().toLowerCase();
}

interface ParsedTag {
  language: string;
  region?: string;
}

function parse(tag: string): ParsedTag {
  let canonical: string;
  try {
    [canonical] = Intl.getCanonicalLocales(tag.trim()) as [string];
  } catch {
    throw new Error(`${JSON.stringify(tag)} is not a well-formed language tag (BCP 47)`);
  }

  const [language, ...rest] = canonical.split("-");

  if (language === undefined || !isLanguage(language)) {
    throw new Error(
      `${JSON.stringify(tag)} names no language ICU knows. ` +
        `A tag is language[-REGION], and the language must exist.`,
    );
  }

  // Script subtags are out of scope in v1 — not because the CLI refuses them
  // (that is its own defect), but because no site here serves a locale that
  // needs one. Accepting what we cannot test is how a library grows a feature
  // nobody has exercised.
  const script = rest.find((part) => part.length === 4);
  if (script !== undefined) {
    throw new Error(
      `${JSON.stringify(tag)} carries the script subtag ${JSON.stringify(script)}, ` +
        `which @goflag/next does not support yet.`,
    );
  }

  const region = rest.find((part) => part.length === 2 || part.length === 3);

  if (region !== undefined && !isRegion(region)) {
    throw new Error(
      `${JSON.stringify(tag)} names no region ICU knows. ` +
        `Note that "ZZ" is a real code meaning "unknown", and is refused too.`,
    );
  }

  return region === undefined ? { language } : { language, region };
}

/**
 * Canonical BCP 47, validated: `pt-br` → `pt-BR`, `EN-us` → `en-US`.
 *
 * Serves both `hreflang` and `lang`, which is the point — a document declaring
 * one form in `lang` and another in `hreflang` answers the same question twice.
 */
export function toBcp47(tag: string): string {
  const { language, region } = parse(tag);
  return region === undefined ? language : `${language}-${region}`;
}

/**
 * `language_TERRITORY`, the only shape Open Graph defines.
 *
 * A tag with no region is completed by ICU's likely subtags — the published
 * CLDR answer to "which region does this language most likely mean", which
 * gives `pt → BR`, `en → US`, `fr → FR`, `es → ES`. Deriving beats asking the
 * site for a table it would copy from the same source.
 */
export function toOpenGraphLocale(tag: string): string {
  const { language, region } = parse(tag);
  const territory = region ?? new Intl.Locale(language).maximize().region;

  if (territory === undefined) {
    throw new Error(
      `Locale ${JSON.stringify(tag)} has no likely region, so og:locale cannot be ` +
        `derived. Give it one: localeTags: { ${JSON.stringify(tag)}: { openGraph: "xx_YY" } }`,
    );
  }

  return `${language}_${territory}`;
}

/**
 * Which served locale a requested one resolves to — RFC 4647 §3.4 *Lookup*,
 * plus one extension.
 *
 * Lookup truncates subtags from the right until something matches, so `pt-BR`
 * finds `pt`. The extension is the other direction: a site serving only
 * `pt-BR` should still answer for `/pt/`, which strict Lookup would not do.
 *
 * **It never falls back to a default.** Resolving an unserved language to the
 * default one would turn every two-letter path segment into a soft 404 —
 * `/de/`, `/it/`, `/ru/` all answering 200 with English. Returning `undefined`
 * is what lets the 404 happen.
 */
export function lookup(requested: string, served: readonly string[]): string | undefined {
  const wanted = localeIdentity(requested);
  const byIdentity = new Map(served.map((locale) => [localeIdentity(locale), locale]));

  // RFC 4647 Lookup: progressively drop trailing subtags.
  const parts = wanted.split("-");
  for (let end = parts.length; end > 0; end -= 1) {
    const candidate = byIdentity.get(parts.slice(0, end).join("-"));
    if (candidate !== undefined) return candidate;
  }

  // The extension: a bare language matching a served regional variant. Only
  // when exactly one variant is served — two would make this a guess about
  // which audience the visitor belongs to.
  const language = parts[0];
  const variants = served.filter((locale) => localeIdentity(locale).split("-")[0] === language);

  return variants.length === 1 ? variants[0] : undefined;
}
