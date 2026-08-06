/** How Open Graph should describe a route. */
export type OgType = "website" | "article";

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
}

export type Route<L extends string> = LocalizedRoute<L> | MonolingualRoute<L>;

/** Where one page sits, and the cluster it declares. */
export interface PageLocation {
  /** Absolute URL of this page — its canonical. */
  readonly url: string;
  /** `alternates.languages`, `x-default` included. */
  readonly languages: Readonly<Record<string, string>>;
}
