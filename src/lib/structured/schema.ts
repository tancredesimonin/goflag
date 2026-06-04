/**
 * The (deliberately small) subset of schema.org Goflag validates.
 *
 * Schema.org is enormous — thousands of types and tens of thousands of
 * properties — and Goflag will never replicate that surface in a
 * runtime check. What we *can* do is encode the handful of types that
 * Google actually surfaces as rich results (Article, Organization,
 * BreadcrumbList, FAQPage, Person, SoftwareApplication, WebSite,
 * Product, Recipe, Event, ImageObject) along with the required and
 * recommended fields for each.
 *
 * The shape below is the runtime mirror of `schema-dts`'s static
 * types: required = "Google's rich-result docs say this property must
 * be present"; recommended = "Google's rich-result docs say providing
 * this is highly desirable". Extending the registry is intentionally
 * additive — adding fields tightens validation, removing fields would
 * silently make existing snapshots regress.
 */

export type FieldKind = "string" | "url" | "iso-date" | "array" | "object" | "any";

export interface SchemaField {
  /** Property name as written on the JSON-LD object (case-sensitive). */
  name: string;
  kind: FieldKind;
  /**
   * For `array` fields, the kind of the items. Validated when present.
   */
  items?: FieldKind;
  /**
   * For `array` fields, whether the array must contain at least one
   * entry (most schema.org "list" properties are useless when empty).
   */
  nonEmpty?: boolean;
}

export interface SchemaShape {
  /**
   * The canonical schema.org type string. Aliases (e.g. `BlogPosting`
   * → reuse `Article` rules) are handled by the validator's lookup,
   * not here.
   */
  type: string;
  required: SchemaField[];
  recommended: SchemaField[];
  /** Free-form one-liner shown in tooltips / docs links. */
  summary: string;
}

const ARTICLE_FIELDS: Pick<SchemaShape, "required" | "recommended" | "summary"> = {
  required: [
    { name: "headline", kind: "string" },
    { name: "author", kind: "any" },
    { name: "datePublished", kind: "iso-date" },
  ],
  recommended: [
    { name: "image", kind: "any" },
    { name: "dateModified", kind: "iso-date" },
    { name: "publisher", kind: "object" },
    { name: "mainEntityOfPage", kind: "any" },
  ],
  summary:
    "Editorial content (blog posts, news, long-form). Powers Google's Top Stories carousel and headline-rich snippets.",
};

export const SCHEMAS: Record<string, SchemaShape> = {
  Article: { type: "Article", ...ARTICLE_FIELDS },
  BlogPosting: { type: "BlogPosting", ...ARTICLE_FIELDS },
  NewsArticle: { type: "NewsArticle", ...ARTICLE_FIELDS },

  Organization: {
    type: "Organization",
    required: [
      { name: "name", kind: "string" },
      { name: "url", kind: "url" },
    ],
    recommended: [
      { name: "logo", kind: "any" },
      { name: "sameAs", kind: "array", items: "url" },
      { name: "contactPoint", kind: "any" },
    ],
    summary:
      "The organisation that owns the site. Powers the brand panel in Google Knowledge Graph results.",
  },

  WebSite: {
    type: "WebSite",
    required: [
      { name: "name", kind: "string" },
      { name: "url", kind: "url" },
    ],
    recommended: [
      { name: "potentialAction", kind: "object" },
      { name: "publisher", kind: "any" },
    ],
    summary:
      "The website itself. With a `potentialAction` SearchAction it unlocks the sitelinks search box on Google.",
  },

  BreadcrumbList: {
    type: "BreadcrumbList",
    required: [{ name: "itemListElement", kind: "array", items: "object", nonEmpty: true }],
    recommended: [],
    summary:
      "Navigation crumbs Google renders directly in the SERP, replacing the URL on the result row.",
  },

  Person: {
    type: "Person",
    required: [{ name: "name", kind: "string" }],
    recommended: [
      { name: "url", kind: "url" },
      { name: "sameAs", kind: "array", items: "url" },
      { name: "image", kind: "any" },
      { name: "jobTitle", kind: "string" },
    ],
    summary:
      "An individual. Powers personal Knowledge Graph panels for authors and public figures.",
  },

  FAQPage: {
    type: "FAQPage",
    required: [{ name: "mainEntity", kind: "array", items: "object", nonEmpty: true }],
    recommended: [],
    summary:
      "A page made of question/answer pairs. Eligible for Google's expandable FAQ rich result.",
  },

  SoftwareApplication: {
    type: "SoftwareApplication",
    required: [
      { name: "name", kind: "string" },
      { name: "applicationCategory", kind: "string" },
      { name: "operatingSystem", kind: "string" },
    ],
    recommended: [
      { name: "offers", kind: "object" },
      { name: "aggregateRating", kind: "object" },
      { name: "url", kind: "url" },
    ],
    summary:
      "An installable app. Powers price + rating chips on Google's app result rows and the Apps tab.",
  },
};

/** Look up a schema definition, falling back to `Article` for the well-known aliases. */
export function getSchema(type: string): SchemaShape | undefined {
  return SCHEMAS[type];
}

export const KNOWN_TYPES: ReadonlySet<string> = new Set(Object.keys(SCHEMAS));
