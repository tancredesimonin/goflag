import { defaultLocale, locales, type Locale } from "@/i18n/config";
import { SITE } from "@/lib/constants";

/**
 * Everything the metadata layer needs to know about the deployment it is
 * describing, as plain values.
 *
 * Values, not lookups: `siteConfig()` is the only function in this directory
 * that reads `process.env`, and every builder downstream takes this object as
 * an argument. That is what makes them testable without mutating a global, and
 * it is the shape `defineSite()` will take when this moves into `@goflag/next`
 * — see `docs/next-plan.md` §2.2.
 */
export interface SiteConfig {
  /**
   * The public origin, without a trailing slash. Every canonical and every
   * hreflang is built from it, so a wrong value here is exactly the
   * `canonical.absolute` failure goflag reports — the one that de-indexes a
   * site without anyone touching a page.
   */
  readonly baseUrl: string;
  /** `og:site_name`, and the suffix of the title template. */
  readonly name: string;
  /** Every locale the site serves, in display order. */
  readonly locales: readonly Locale[];
  readonly defaultLocale: Locale;
  /**
   * Whether this deployment asks to be indexed.
   *
   * One flag drives both declarations — `robots.txt` and the `robots` meta tag
   * — because a site that serves `Disallow: /` while its pages ask to be
   * indexed is precisely `robots.conflict`, and the only way to make that rule
   * unsatisfiable is to leave no way to set the two apart.
   */
  readonly indexable: boolean;
}

/**
 * Strip trailing slashes so `${baseUrl}${path}` can never produce `//`.
 *
 * A double slash is a different URL to a crawler, which means a canonical that
 * does not match the page it sits on. Cheap to prevent, invisible when it
 * happens.
 */
function normalizeOrigin(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Read the environment. The only place in this directory that does.
 *
 * Called per request rather than memoised at module scope on purpose: the
 * production flag must be read at runtime, not baked in at build time, because
 * a container that ships the staging value would otherwise serve `Disallow: /`
 * forever with nothing able to correct it.
 */
export function siteConfig(): SiteConfig {
  return {
    baseUrl: normalizeOrigin(
      process.env.NEXT_PUBLIC_WEBSITE_FRONTEND_URL || `https://${SITE.domain}`,
    ),
    name: SITE.name,
    locales,
    defaultLocale,
    indexable: process.env.APP_ENV === "production",
  };
}

/** Whether this deployment is the production one. Also gates analytics. */
export function isProduction(): boolean {
  return siteConfig().indexable;
}
