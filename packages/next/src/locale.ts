/**
 * Locale tags, in the three forms a page needs them.
 *
 * A site names its locales for its own routing (`pt-br`, because that is the
 * URL segment). `hreflang` and `lang` want BCP 47 (`pt-BR`). Open Graph wants
 * an underscore and a territory (`pt_BR`). Those three tables get copied into
 * every site by hand, and `locale.invalid` exists because they get copied
 * wrong.
 */

/**
 * Shape check for the subset of BCP 47 a website actually uses:
 * `language[-Script][-REGION][-variant…]`. The full grammar allows extensions
 * and private-use subtags that no site sets on an `hreflang`, and accepting
 * them here would mean claiming to normalise something we do not understand.
 */
const BCP47 =
  /^[A-Za-z]{2,3}(-[A-Za-z]{4})?(-([A-Za-z]{2}|[0-9]{3}))?(-([A-Za-z0-9]{5,8}|[0-9][A-Za-z0-9]{3}))*$/;

/**
 * Put a tag in its canonical case: language lowercase, script titlecase, region
 * uppercase.
 *
 * Case is not cosmetic here. BCP 47 says tags are case-insensitive, so `pt-br`
 * is correct and a validator will accept it — but the canonical form is what
 * every example, every vendor doc and every diff shows, and a site that emits
 * one form in `hreflang` and the other in `og:locale` looks broken to a reader
 * even when no tool complains.
 */
export function toBcp47(tag: string): string {
  if (!BCP47.test(tag)) {
    throw new Error(
      `${JSON.stringify(tag)} is not a language tag this library can normalise ` +
        `(expected language[-Script][-REGION], per BCP 47)`,
    );
  }

  return tag
    .split("-")
    .map((subtag, index) => {
      if (index === 0) return subtag.toLowerCase();
      if (subtag.length === 4 && /^[A-Za-z]+$/.test(subtag)) {
        return subtag[0]!.toUpperCase() + subtag.slice(1).toLowerCase();
      }
      if (subtag.length <= 3) return subtag.toUpperCase();
      return subtag.toLowerCase();
    })
    .join("-");
}

/** The region subtag, if the tag carries one. */
export function regionOf(tag: string): string | undefined {
  const [, ...rest] = toBcp47(tag).split("-");

  return rest.find((subtag) => subtag.length <= 3 && subtag === subtag.toUpperCase());
}

/**
 * `language_TERRITORY`, the only form Open Graph defines.
 *
 * A bare language has no answer here, and this throws rather than inventing
 * one. `og:locale` is a territory-qualified tag by definition — emitting `en`
 * would be a value ogp.me does not describe, and picking `en_US` for a site
 * that said `en` would be this library deciding the site serves Americans.
 * Both are worse than a build error with a one-line fix.
 */
export function toOpenGraphLocale(tag: string): string {
  const bcp47 = toBcp47(tag);
  const region = regionOf(bcp47);

  if (region === undefined) {
    throw new Error(
      `Locale ${JSON.stringify(tag)} has no territory, and og:locale is defined as ` +
        `language_TERRITORY. Give it one in defineSite: ` +
        `localeTags: { ${JSON.stringify(tag)}: { openGraph: "${bcp47}_XX" } }`,
    );
  }

  return `${bcp47.split("-")[0]}_${region}`;
}
