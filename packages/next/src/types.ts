/** How Open Graph should describe a route. */
export type OgType = "website" | "article";

/** sitemaps.org `<changefreq>`. Google ignores it; the protocol still defines it. */
export type ChangeFrequency =
  "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";

/** A route served under `/[locale]`, belonging to an hreflang cluster. */
export interface LocalizedRoute<L extends string> {
  readonly policy: "localized";
  /** The family it was declared in. */
  readonly family: string;
  /** Path after the locale segment. Empty string for the home page. */
  readonly path: string;
  /**
   * The locales this route is *actually* served in — derived from the content,
   * never assumed to be every locale the site declares. A route that exists in
   * two of four locales must advertise two, or its cluster points at 404s.
   */
  readonly locales: readonly L[];
  readonly ogType: OgType;
  readonly changeFrequency?: ChangeFrequency;
  readonly priority?: number;
  /**
   * Which locales of this route the sitemap lists. Absent, or absent for a
   * locale, means listed — the omission is what gets declared, never the
   * inclusion.
   *
   * Per locale for the same reason `lastModified` is: a collection can exclude
   * one translation and keep the others, and collapsing that to a single flag
   * would silently take the whole cluster out.
   *
   * This changes the sitemap and nothing else. The canonical, the cluster and
   * every refusal stay, because "not an entry point" is not "not a page".
   */
  readonly sitemap?: Readonly<Partial<Record<L, boolean>>>;
  /**
   * Last-modified per locale, where the content supplied one.
   *
   * Per locale rather than per route because a translation is edited on its own
   * day. Collapsing them to a single date would make three of the four rows
   * claim a change that did not happen to them.
   */
  readonly lastModified?: Readonly<Partial<Record<L, Date>>>;
}

/**
 * A route served at one fixed path, in one language, outside the locale
 * segment: a reference that exists in English and says so, rather than
 * pretending to a cluster it does not have.
 */
export interface MonolingualRoute<L extends string> {
  readonly policy: "monolingual";
  readonly family: string;
  /** Full path from the origin. */
  readonly path: string;
  readonly locale: L;
  readonly ogType: OgType;
  readonly changeFrequency?: ChangeFrequency;
  readonly priority?: number;
  /** Whether the sitemap lists it. Absent means listed. */
  readonly sitemap?: boolean;
  readonly lastModified?: Date;
}

export type Route<L extends string> = LocalizedRoute<L> | MonolingualRoute<L>;

/** Where one page sits, and the cluster it declares. */
export interface PageLocation {
  /** Absolute URL of this page — its canonical. */
  readonly url: string;
  /** `alternates.languages`, `x-default` included. */
  readonly languages: Readonly<Record<string, string>>;
}
