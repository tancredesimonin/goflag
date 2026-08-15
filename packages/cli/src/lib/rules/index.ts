/**
 * Rule registry — the SEO metadata policies goflag ships, as sourced
 * descriptors (rules-catalog plan §6).
 *
 * Each rule declares what it enforces (`title`, `why`), how authoritative
 * the requirement is (`rigor` + cited `sources` from `./sources`), which
 * extraction paths it reads, and a pure evaluator over the `Extraction`
 * observation model. Rules never see raw HTML or the engine's `Page`.
 *
 * Deliberately small. These cover the metadata mistakes that are (a)
 * high-impact for search/social and (b) invisible to a human eyeballing a
 * page in a browser. i18n reciprocity ("missing translations") is
 * intentionally NOT a rule here — it is a cross-page concern computed once
 * in `../core/i18n.ts` and surfaced in the report's `missingTranslations`
 * section. Cross-page rules live in `./site-rules.ts`.
 */

import { bandFor } from "./evaluate";
import type { ExtractionAsset, ExtractionIcon } from "./extraction/types";
import type { BooleanRule, Extraction, Rule, ScoredRule, TagOrigin } from "./types";

const TITLE_IDEAL: [number, number] = [10, 60];
const TITLE_ACCEPTABLE: [number, number] = [5, 70];
const DESC_IDEAL: [number, number] = [50, 160];
const DESC_ACCEPTABLE: [number, number] = [25, 200];

/** The aspect ratio a link preview is laid out for, and how far off is tolerable. */
const RATIO_IDEAL: [number, number] = [1.7, 2.1];
const RATIO_ACCEPTABLE: [number, number] = [1, 3];

function tokens(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

/** Whether a string is a URL a crawler can fetch without a base to resolve it. */
function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** A language tag reduced to the two subtags `og:locale` is able to express. */
function localeParts(tag: string): { language: string; region?: string } | undefined {
  const subtags = tag.trim().toLowerCase().split(/[-_]/).filter(Boolean);
  const language = subtags[0];
  if (!language || !/^[a-z]{2,3}$/.test(language)) return undefined;
  const region = subtags.slice(1).find((s) => /^([a-z]{2}|\d{3})$/.test(s));
  return region ? { language, region } : { language };
}

/**
 * Whether two tags name the same locale for Open Graph's purposes.
 *
 * `og:locale` is `language_TERRITORY` and hreflang is BCP 47, so `pt_BR` and
 * `pt-BR` are one declaration written twice. A tag with no territory matches
 * every territory of its language: a page whose hreflang says `fr` cannot be
 * faulted for an `og:locale:alternate` of `fr_FR`, because only one of the two
 * formats is able to state the difference.
 */
function sameLocale(a: string, b: string): boolean {
  const left = localeParts(a);
  const right = localeParts(b);
  if (!left || !right || left.language !== right.language) return false;
  return !left.region || !right.region || left.region === right.region;
}

/**
 * The locales this page's hreflang annotations put it in a cluster with,
 * normalized and de-duplicated. `x-default` is excluded: it names a fallback,
 * not a locale, and counting it would make a monolingual page look translated.
 */
function hreflangCluster(ex: Extraction): string[] {
  const seen = new Set<string>();
  for (const annotation of ex.links.hreflang) {
    if (annotation.isXDefault) continue;
    const parts = localeParts(annotation.hreflang);
    if (!parts) continue;
    seen.add(parts.region ? `${parts.language}-${parts.region}` : parts.language);
  }
  return [...seen];
}

/** One asset's outcome, said the way a finding has to say it. */
function describeAsset(status: number, contentType: string | undefined): string {
  if (status === 0) return "the request failed";
  if (status >= 400 || status < 200) return `HTTP ${status}`;
  return `HTTP ${status} with \`${contentType ?? "no content type"}\`, which is not an image`;
}

/** `rel` tokens that declare an icon, lowercased. */
const ICON_RELS = new Set([
  "icon",
  "shortcut icon",
  "apple-touch-icon",
  "apple-touch-icon-precomposed",
  "mask-icon",
]);

/** `rel` tokens Apple reads for the home-screen icon. */
const APPLE_ICON_RELS = new Set(["apple-touch-icon", "apple-touch-icon-precomposed"]);

/** The icons this page's `<head>` declares, whatever flavour of `rel` it used. */
function declaredIcons(ex: Extraction): ExtractionIcon[] {
  return ex.links.icons.filter((icon) => ICON_RELS.has(icon.rel.trim().toLowerCase()));
}

function normalise(value: string): string {
  return value.trim().toLowerCase().split(/\s+/).sort().join(" ");
}

/**
 * Whether two icon references name the same file.
 *
 * A `<link href>` is resolved against the page; a manifest `src` is resolved
 * against the manifest and arrives verbatim. Comparing the paths — after
 * dropping any query — is what lets `/icon.png` and
 * `https://example.com/icon.png` be recognised as one declaration made twice,
 * which is the only case this comparison exists for.
 */
function sameAsset(href: string, src: string): boolean {
  const pathOf = (value: string): string => {
    try {
      return new URL(value, "https://goflag.invalid").pathname;
    } catch {
      return value.split("?")[0] ?? value;
    }
  };
  return pathOf(href) === pathOf(src);
}

/**
 * Whether the page opted into Open Graph at all. The locale rules stay quiet
 * on a page with no `og:*` tags: `og.title.missing` and `og.image.missing`
 * already say the thing worth saying, and a third finding asking for
 * `og:locale` on a page that has no Open Graph is noise stacked on a verdict.
 */
function hasOpenGraph(ex: Extraction): boolean {
  return Boolean(
    ex.openGraph.title?.value || ex.openGraph.images.length > 0 || ex.openGraph.url?.value,
  );
}

const titleMissing: BooleanRule = {
  id: "title.missing",
  kind: "boolean",
  category: "document",
  severity: "error",
  title: "Every page needs a non-empty `<title>`",
  why:
    "The title element is required by the HTML standard and is the primary " +
    "label search engines, browser tabs, bookmarks, and screen readers use " +
    "for the page.",
  rigor: "spec-required",
  sources: ["whatwg-html-title"],
  reads: ["document.title"],
  expected: "a non-empty `<title>` element",
  relates: ["title.length", "og.title.missing"],
  fix: {
    title: "Add a <title> to <head>",
    snippet: [
      "// app/…/page.tsx — App Router owns the <head>; never hand-write the tag.",
      'export const metadata = { title: "Page name — Site name" };',
    ].join("\n"),
    language: "tsx",
  },
  evaluate: (ex) => {
    const observed = ex.document.title?.value?.trim();
    if (observed) return { status: "pass", observed };
    return {
      status: "fail",
      observed: observed ?? null,
      message: "Page is missing a `<title>` element (or it is empty).",
      origin: { kind: "title" },
    };
  },
};

const titleLength: ScoredRule = {
  id: "title.length",
  kind: "scored",
  category: "document",
  title: `Keep \`<title>\` between ${TITLE_IDEAL[0]} and ${TITLE_IDEAL[1]} characters`,
  why:
    "Long titles get truncated in search results and short ones waste the " +
    "one line every result gets. The window is display folklore, not spec — " +
    "Google states title length is not a ranking factor.",
  rigor: "heuristic",
  sources: ["google-title-link", "moz-title-tag"],
  reads: ["document.title"],
  bands: { ideal: TITLE_IDEAL, acceptable: TITLE_ACCEPTABLE },
  severityByBand: { acceptable: "warning", poor: "warning" },
  expected: `${TITLE_IDEAL[0]}–${TITLE_IDEAL[1]} characters`,
  relates: ["title.missing"],
  evaluate: (ex) => {
    const value = ex.document.title?.value?.trim();
    if (!value) return { status: "na", observed: 0 };
    const { status, band } = bandFor(value.length, {
      ideal: TITLE_IDEAL,
      acceptable: TITLE_ACCEPTABLE,
    });
    if (status === "pass") return { status, band, observed: value.length };
    const direction = value.length < TITLE_IDEAL[0] ? "short" : "long";
    return {
      status,
      band,
      observed: value.length,
      message: `Title is ${value.length} characters — ${direction} of the recommended ${TITLE_IDEAL[0]}–${TITLE_IDEAL[1]} window.`,
      origin: { kind: "title" },
    };
  },
};

const descriptionMissing: BooleanRule = {
  id: "description.missing",
  kind: "boolean",
  category: "meta",
  severity: "warning",
  title: 'Provide a `<meta name="description">` on every indexable page',
  why:
    "The description feeds the search-result snippet. Without one, engines " +
    "improvise from page text — usually worse than a sentence you wrote.",
  rigor: "spec-recommended",
  sources: ["whatwg-html-standard-metadata-names", "google-snippet"],
  reads: ["meta.description"],
  expected: 'a non-empty `<meta name="description">`',
  relates: ["description.length", "og.description.missing"],
  fix: {
    title: "Add a meta description",
    snippet: [
      "// app/…/page.tsx",
      "export const metadata = {",
      '  description: "One sentence that promises what this page delivers.",',
      "};",
    ].join("\n"),
    language: "tsx",
  },
  evaluate: (ex) => {
    const observed = ex.meta.description?.value?.trim();
    if (observed) return { status: "pass", observed };
    return {
      status: "fail",
      observed: observed ?? null,
      message: 'Page has no `<meta name="description">`.',
      origin: { kind: "meta", name: "description" },
    };
  },
};

const descriptionLength: ScoredRule = {
  id: "description.length",
  kind: "scored",
  category: "meta",
  title: `Keep descriptions between ${DESC_IDEAL[0]} and ${DESC_IDEAL[1]} characters`,
  why:
    "Snippets truncate around 160 characters and very short descriptions " +
    "get replaced by improvised page text. Display folklore, not spec.",
  rigor: "heuristic",
  sources: ["google-snippet", "moz-meta-description"],
  reads: ["meta.description"],
  bands: { ideal: DESC_IDEAL, acceptable: DESC_ACCEPTABLE },
  severityByBand: { acceptable: "warning", poor: "warning" },
  expected: `${DESC_IDEAL[0]}–${DESC_IDEAL[1]} characters`,
  relates: ["description.missing"],
  evaluate: (ex) => {
    const value = ex.meta.description?.value?.trim();
    if (!value) return { status: "na", observed: 0 };
    const { status, band } = bandFor(value.length, {
      ideal: DESC_IDEAL,
      acceptable: DESC_ACCEPTABLE,
    });
    if (status === "pass") return { status, band, observed: value.length };
    const direction = value.length < DESC_IDEAL[0] ? "short" : "long";
    return {
      status,
      band,
      observed: value.length,
      message: `Description is ${value.length} characters — ${direction} of the recommended ${DESC_IDEAL[0]}–${DESC_IDEAL[1]} window.`,
      origin: { kind: "meta", name: "description" },
    };
  },
};

const canonicalMissing: BooleanRule = {
  id: "canonical.missing",
  kind: "boolean",
  category: "canonical",
  severity: "warning",
  title: 'Declare a `<link rel="canonical">` so search engines pick the right URL',
  why:
    "Without a canonical, engines choose among duplicate URLs (tracking " +
    "params, http/https, trailing slashes) themselves — and may split " +
    "ranking signals across them.",
  rigor: "vendor-spec",
  sources: ["ietf-rfc6596", "google-canonicalization"],
  reads: ["meta.canonical"],
  expected: 'a `<link rel="canonical">` declaration',
  relates: ["canonical.absolute"],
  fix: {
    title: "Declare the canonical URL",
    snippet: [
      "// app/…/page.tsx — relative canonicals resolve against metadataBase,",
      "// which defaults to localhost and silently breaks in production.",
      "export const metadata = {",
      "  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL!),",
      '  alternates: { canonical: "/the-page" },',
      "};",
    ].join("\n"),
    language: "tsx",
  },
  evaluate: (ex) => {
    const observed = ex.meta.canonical?.value;
    if (observed) return { status: "pass", observed };
    return {
      status: "fail",
      observed: null,
      message: 'Page is missing `<link rel="canonical">`.',
      origin: { kind: "link", rel: "canonical" },
    };
  },
};

const canonicalAbsolute: BooleanRule = {
  id: "canonical.absolute",
  kind: "boolean",
  category: "canonical",
  severity: "error",
  title: '`rel="canonical"` must be an absolute, fully-qualified URL',
  why:
    "Consumers read the literal attribute value, not the browser-resolved " +
    "URL. A relative canonical means every consumer resolves it against " +
    "whatever base it assumes — including the wrong origin.",
  rigor: "vendor-spec",
  sources: ["ietf-rfc6596", "google-canonicalization", "whatwg-url"],
  reads: ["meta.canonical"],
  expected: "an absolute `http(s)://` canonical URL",
  relates: ["canonical.missing"],
  evaluate: (ex) => {
    const canonical = ex.meta.canonical;
    const raw = canonical?.raw?.trim();
    if (!raw) return { status: "na", observed: null };
    if (/^https?:\/\//i.test(raw)) return { status: "pass", observed: raw };
    return {
      status: "fail",
      observed: raw,
      message: `Canonical is "${raw}" — must be an absolute http(s) URL (consumers see the raw value, not the resolved "${canonical?.value ?? raw}").`,
      origin: { kind: "link", rel: "canonical" },
    };
  },
};

const viewportMissing: BooleanRule = {
  id: "viewport.missing",
  kind: "boolean",
  category: "meta",
  severity: "warning",
  title: 'Declare a `<meta name="viewport">` so mobile browsers render at the right scale',
  why:
    "Without a viewport declaration mobile browsers render at desktop " +
    "width and scale down — unreadable text and a mobile-usability demotion.",
  rigor: "guideline",
  sources: ["mdn-viewport", "whatwg-html-standard-metadata-names"],
  reads: ["meta.viewport"],
  expected: 'a `<meta name="viewport">` declaration',
  fix: {
    title: "Add a viewport meta",
    snippet: [
      "// app/layout.tsx — a dedicated export, not part of `metadata`.",
      'export const viewport = { width: "device-width", initialScale: 1 };',
    ].join("\n"),
    language: "tsx",
  },
  evaluate: (ex) => {
    const observed = ex.meta.viewport?.value?.trim();
    if (observed) return { status: "pass", observed };
    return {
      status: "fail",
      observed: null,
      message:
        'Page has no `<meta name="viewport">` — mobile browsers will render at desktop width.',
      origin: { kind: "meta", name: "viewport" },
    };
  },
};

const ogTitleMissing: BooleanRule = {
  id: "og.title.missing",
  kind: "boolean",
  category: "opengraph",
  severity: "warning",
  title: "Set an explicit `og:title` instead of relying on `<title>` fallback",
  why:
    "og:title is one of the four properties the Open Graph protocol " +
    "requires. Consumers that fall back to `<title>` drag site-name " +
    "boilerplate into the unfurl.",
  rigor: "vendor-spec",
  sources: ["ogp"],
  reads: ["openGraph.title"],
  expected: "an explicit `og:title`",
  relates: ["title.missing", "og.image.missing"],
  evaluate: (ex) => {
    const observed = ex.openGraph.title?.value?.trim();
    if (observed) return { status: "pass", observed };
    return {
      status: "fail",
      observed: null,
      message: "Page has no `og:title`; consumers will fall back to `<title>` (or nothing).",
      origin: { kind: "meta", property: "og:title" },
    };
  },
};

const ogDescriptionMissing: BooleanRule = {
  id: "og.description.missing",
  kind: "boolean",
  category: "opengraph",
  severity: "info",
  title: "Set an explicit `og:description` for richer link unfurls",
  why:
    "A page that opted into Open Graph but omitted og:description gets " +
    "unfurls that fall back to the meta description — or to nothing.",
  rigor: "vendor-spec",
  sources: ["ogp", "meta-og-sharing"],
  reads: ["openGraph.description", "openGraph.title", "openGraph.images", "openGraph.url"],
  expected: "an `og:description` alongside the other `og:*` tags",
  relates: ["description.missing"],
  evaluate: (ex) => {
    const observed = ex.openGraph.description?.value?.trim();
    if (observed) return { status: "pass", observed };
    // Only meaningful when the page bothered with any other OG tag.
    if (!hasOpenGraph(ex)) return { status: "na", observed: null };
    return {
      status: "fail",
      observed: null,
      message:
        "Page has `og:*` tags but no `og:description`; unfurls will fall back to the meta description (or nothing).",
      origin: { kind: "meta", property: "og:description" },
    };
  },
};

const ogImageMissing: BooleanRule = {
  id: "og.image.missing",
  kind: "boolean",
  category: "opengraph",
  severity: "warning",
  title: "Provide at least one `og:image` so links unfurl with a preview",
  why:
    "og:image is one of the four required Open Graph properties, and the " +
    "one with the most visible payoff: without it, unfurls are text-only " +
    "or pick a random body image.",
  rigor: "vendor-spec",
  sources: ["ogp", "meta-og-sharing"],
  reads: ["openGraph.images"],
  expected: "at least one `og:image`",
  relates: ["og.title.missing"],
  fix: {
    title: "Add an og:image",
    snippet: [
      "// app/…/page.tsx",
      "export const metadata = {",
      '  openGraph: { images: [{ url: "/og.png", width: 1200, height: 630 }] },',
      "};",
      "// Or generate one per page: app/…/opengraph-image.tsx with ImageResponse.",
    ].join("\n"),
    language: "tsx",
  },
  evaluate: (ex) => {
    if (ex.openGraph.images.length > 0) {
      return { status: "pass", observed: ex.openGraph.images.map((i) => i.url.value) };
    }
    return {
      status: "fail",
      observed: [],
      message:
        "Page has no `og:image`. Link unfurls will fall back to text-only or a random body image.",
      origin: { kind: "meta", property: "og:image" },
    };
  },
};

const ogImageAbsolute: BooleanRule = {
  id: "og.image.absolute",
  kind: "boolean",
  category: "opengraph",
  // The same severity as `og.image.missing`, deliberately: the unfurl is
  // identical either way, and the registry should not rank the broken
  // declaration above the absent one when their effect is the same.
  severity: "warning",
  title: "`og:image` must be an absolute URL",
  why:
    "Unlike a browser, the crawler that builds the preview has no document to " +
    "resolve a relative path against — it reads the tag, not the page. A " +
    "relative `og:image` is therefore not a smaller mistake than a missing " +
    "one: the unfurl is identical, and the tag makes it look handled.",
  rigor: "vendor-spec",
  sources: ["ogp", "meta-og-sharing"],
  reads: ["openGraph.images"],
  expected: "every `og:image` URL absolute, scheme included",
  relates: ["og.image.missing", "canonical.absolute"],
  fix: {
    title: "Give Next a metadataBase, or write the origin in",
    snippet: [
      "// app/layout.tsx — every relative metadata URL resolves against this.",
      "export const metadata = {",
      "  metadataBase: new URL(process.env.SITE_ORIGIN!),",
      '  openGraph: { images: ["/og.png"] }, // emitted absolute',
      "};",
    ].join("\n"),
    language: "tsx",
  },
  evaluate: (ex) => {
    if (ex.openGraph.images.length === 0) return { status: "na", observed: null };

    const declarations: Array<{ property: string; value: string }> = [];
    for (const image of ex.openGraph.images) {
      declarations.push({ property: "og:image", value: image.url.value.trim() });
      if (image.secureUrl) {
        declarations.push({
          property: "og:image:secure_url",
          value: image.secureUrl.value.trim(),
        });
      }
    }

    const observed = declarations.map((d) => d.value);
    const relative = declarations.filter((d) => !isAbsoluteHttpUrl(d.value));
    if (relative.length === 0) return { status: "pass", observed };

    return {
      status: "fail",
      observed,
      message: `Open Graph image URL is not absolute: ${relative
        .map((d) => `\`${d.property}\` = \`${d.value}\``)
        .join(", ")}. Crawlers cannot resolve it.`,
      origin: { kind: "meta", property: relative[0]!.property },
    };
  },
};

const ogImageAlt: BooleanRule = {
  id: "og.image.alt",
  kind: "boolean",
  category: "opengraph",
  severity: "warning",
  title: "Describe the shared image with `og:image:alt`",
  why:
    "The protocol defines `og:image:alt` as a description of what is in the " +
    "image, and a generated card usually carries the page's title as pixels. " +
    "Omitting it leaves that text sighted-only, in the one place a link is " +
    "seen before anybody has opened the page. Optional in the vocabulary, " +
    "which is why this is a guideline and not a spec violation.",
  rigor: "guideline",
  sources: ["ogp"],
  reads: ["openGraph.images"],
  expected: "an `og:image:alt` beside every `og:image`",
  relates: ["og.image.missing"],
  fix: {
    title: "Carry the alt per image, not as a constant",
    snippet: [
      "// app/…/opengraph-image.tsx — `export const alt` is one fixed string, so a",
      "// translated or data-derived description has to go through the metadata fn.",
      "export async function generateImageMetadata({ params }) {",
      "  const t = await getTranslations({ locale: params.locale });",
      '  return [{ id: "og", size, contentType, alt: t("og.alt") }];',
      "}",
    ].join("\n"),
    language: "tsx",
  },
  evaluate: (ex) => {
    if (ex.openGraph.images.length === 0) return { status: "na", observed: null };

    const observed = ex.openGraph.images.map((image) => ({
      url: image.url.value,
      alt: image.alt?.value ?? null,
    }));
    const undescribed = observed.filter((image) => !image.alt?.trim());
    if (undescribed.length === 0) return { status: "pass", observed };

    return {
      status: "fail",
      observed,
      message:
        undescribed.length === observed.length
          ? "Page declares an `og:image` with no `og:image:alt`."
          : `${undescribed.length} of ${observed.length} \`og:image\` declarations have no \`og:image:alt\`.`,
      origin: { kind: "meta", property: "og:image:alt" },
    };
  },
};

const ogImageDimensions: BooleanRule = {
  id: "og.image.dimensions",
  kind: "boolean",
  category: "opengraph",
  severity: "warning",
  title: "Declare `og:image:width` and `og:image:height`",
  why:
    "A crawler that does not know the size cannot lay the card out until it " +
    "has fetched the image, so the first share of a URL renders without it — " +
    "the one share that matters most. The dimensions are the fix, and they " +
    "cost two tags.",
  rigor: "vendor-spec",
  sources: ["ogp", "meta-og-sharing"],
  reads: ["openGraph.images"],
  expected: "both `og:image:width` and `og:image:height` on every image",
  relates: ["og.image.missing", "og.image.ratio"],
  fix: {
    title: "Declare the size alongside the URL",
    snippet: [
      "// app/…/page.tsx",
      "export const metadata = {",
      '  openGraph: { images: [{ url: "/og.png", width: 1200, height: 630 }] },',
      "};",
      "// The file convention emits both from `export const size` for free.",
    ].join("\n"),
    language: "tsx",
  },
  evaluate: (ex) => {
    if (ex.openGraph.images.length === 0) return { status: "na", observed: null };

    const observed = ex.openGraph.images.map((image) => ({
      url: image.url.value,
      width: image.width?.value ?? null,
      height: image.height?.value ?? null,
    }));
    const incomplete = observed.filter((image) => image.width === null || image.height === null);
    if (incomplete.length === 0) return { status: "pass", observed };

    return {
      status: "fail",
      observed,
      message: `${incomplete.length === observed.length ? "The" : `${incomplete.length} of ${observed.length}`} \`og:image\` declaration${
        incomplete.length === 1 ? "" : "s"
      } omit${incomplete.length === 1 ? "s" : ""} \`og:image:width\` or \`og:image:height\`.`,
      origin: { kind: "meta", property: "og:image:width" },
    };
  },
};

const ogImageRatio: ScoredRule = {
  id: "og.image.ratio",
  kind: "scored",
  category: "opengraph",
  title: "Keep the shared image near the 1.91:1 the card is laid out for",
  why:
    "Meta's recommended 1200×630 is a shape before it is a size. An image far " +
    "from it is not rejected — it is cropped to fit, and the crop is chosen " +
    "by the consumer rather than by you.",
  rigor: "vendor-spec",
  sources: ["meta-og-sharing", "x-cards"],
  reads: ["openGraph.images"],
  bands: { ideal: RATIO_IDEAL, acceptable: RATIO_ACCEPTABLE },
  severityByBand: { acceptable: "info", poor: "warning" },
  expected: `a width ÷ height between ${RATIO_IDEAL[0]} and ${RATIO_IDEAL[1]} (1.91:1 is 1.9)`,
  relates: ["og.image.dimensions"],
  evaluate: (ex) => {
    // The first image that states its size: consumers take the first one they
    // can use, and a rule that measured the others would band a picture no
    // unfurl is going to show.
    const measured = ex.openGraph.images.find((image) => image.width?.value && image.height?.value);
    // No image, or none that declared its size — `og.image.dimensions` owns
    // that gap, and guessing a ratio from an unfetched image would be a
    // measurement goflag did not make.
    if (!measured) return { status: "na", observed: 0 };

    const ratio = Math.round((measured.width!.value / measured.height!.value) * 100) / 100;
    const { status, band } = bandFor(ratio, { ideal: RATIO_IDEAL, acceptable: RATIO_ACCEPTABLE });
    if (status === "pass") return { status, band, observed: ratio };

    return {
      status,
      band,
      observed: ratio,
      message: `\`og:image\` is ${measured.width!.value}×${measured.height!.value} — a ratio of ${ratio}:1, against the 1.91:1 the preview card is laid out for. Consumers will crop it.`,
      origin: { kind: "meta", property: "og:image:width" },
    };
  },
};

const ogLocaleMissing: BooleanRule = {
  id: "og.locale.missing",
  kind: "boolean",
  category: "opengraph",
  severity: "warning",
  title: "A translated page has to say which locale it is in",
  why:
    "`og:locale` defaults to `en_US` in the protocol itself — so a page that " +
    "omits it does not decline to answer, it answers wrongly. On a site whose " +
    "whole point is that the same page exists in several languages, every " +
    "translation claims to be American English.",
  rigor: "vendor-spec",
  sources: ["ogp"],
  reads: ["openGraph.locale", "links.hreflang"],
  expected: "an `og:locale` on any page that declares hreflang alternates",
  relates: ["og.locale.alternates", "hreflang.missing"],
  fix: {
    title: "Emit the locale in the page's own metadata",
    snippet: [
      "// app/[locale]/…/page.tsx",
      "export const metadata = {",
      '  openGraph: { locale: "fr_FR", alternateLocale: ["en_US", "es_ES"] },',
      "};",
    ].join("\n"),
    language: "tsx",
  },
  evaluate: (ex) => {
    const cluster = hreflangCluster(ex);
    const observed = ex.openGraph.locale?.value?.trim() ?? null;
    if (cluster.length < 2 || !hasOpenGraph(ex)) return { status: "na", observed };
    if (observed) return { status: "pass", observed };

    return {
      status: "fail",
      observed: null,
      message: `Page declares hreflang alternates (${cluster.join(", ")}) but no \`og:locale\`; the protocol default \`en_US\` applies instead.`,
      origin: { kind: "meta", property: "og:locale" },
    };
  },
};

const ogLocaleAlternates: BooleanRule = {
  id: "og.locale.alternates",
  kind: "boolean",
  category: "opengraph",
  severity: "warning",
  title: "`og:locale:alternate` and the hreflang cluster must name the same locales",
  why:
    "Two vocabularies describe the same fact — this page exists in these " +
    "languages — and nothing in a build keeps them in step, so they drift " +
    "silently. Whichever one is short is the one telling a consumer that a " +
    "translation it could have linked to does not exist.",
  rigor: "vendor-spec",
  sources: ["ogp", "google-hreflang"],
  reads: ["openGraph.locale", "openGraph.localeAlternates", "links.hreflang"],
  expected: "one `og:locale:alternate` per hreflang locale other than this page's own",
  relates: ["og.locale.missing", "hreflang.missing"],
  fix: {
    title: "Derive both lists from the same cluster",
    snippet: [
      "// The hreflang map and the OG locales are one fact stated twice.",
      "openGraph: {",
      "  locale: ogLocale(locale),",
      "  alternateLocale: cluster.filter((l) => l !== locale).map(ogLocale),",
      "},",
      "alternates: { languages: cluster },",
    ].join("\n"),
    language: "ts",
  },
  evaluate: (ex) => {
    const cluster = hreflangCluster(ex);
    const own = ex.openGraph.locale?.value?.trim();
    const declared = ex.openGraph.localeAlternates.map((a) => a.value.trim()).filter(Boolean);
    const observed = { locale: own ?? null, alternates: declared, hreflang: cluster };

    // With no `og:locale` there is no "own locale" to subtract from the
    // cluster, and `og.locale.missing` is already reporting the same page.
    if (cluster.length < 2 || !own) return { status: "na", observed };

    const missing = cluster.filter(
      (tag) => !sameLocale(tag, own) && !declared.some((d) => sameLocale(d, tag)),
    );
    const unbacked = declared.filter((d) => !cluster.some((tag) => sameLocale(tag, d)));
    if (missing.length === 0 && unbacked.length === 0) return { status: "pass", observed };

    const disagreements: string[] = [];
    if (missing.length > 0) {
      disagreements.push(`no \`og:locale:alternate\` for ${missing.join(", ")}`);
    }
    if (unbacked.length > 0) {
      disagreements.push(`\`og:locale:alternate\` ${unbacked.join(", ")} has no hreflang`);
    }

    return {
      status: "fail",
      observed,
      message: `Open Graph and hreflang disagree about this page's translations: ${disagreements.join("; ")}.`,
      origin: { kind: "meta", property: "og:locale:alternate" },
    };
  },
};

const iconsMissing: BooleanRule = {
  id: "icons.missing",
  kind: "boolean",
  category: "icons",
  severity: "warning",
  title: "Declare an icon — the tab, the bookmark and the share sheet all read one",
  why:
    "No specification requires an icon, which is exactly why nothing complains " +
    "and every consumer improvises. A browser falls back to `/favicon.ico` at " +
    "the root, a feed reader or a link unfurler often falls back to nothing, " +
    "and a bookmark to a site with no icon is a grey square among fifty.",
  rigor: "guideline",
  sources: ["whatwg-html-link-types", "mdn-link-rel"],
  reads: ["links.icons", "links.manifest"],
  expected: 'at least one `<link rel="icon">`, or icons declared by a manifest',
  relates: ["icons.apple-touch.missing", "icons.manifest-mismatch"],
  fix: {
    title: "Let the file convention declare it",
    snippet: [
      '// app/icon.svg (or icon.png) — Next emits the <link rel="icon"> itself.',
      '// app/apple-icon.png likewise emits rel="apple-touch-icon".',
      "// A /favicon.ico at the root is a separate matter: see icons.ico.missing.",
    ].join("\n"),
    language: "tsx",
  },
  evaluate: (ex) => {
    const head = declaredIcons(ex);
    const fromManifest = ex.links.manifest?.icons ?? [];
    const observed = {
      head: head.map((icon) => ({ rel: icon.rel, href: icon.href })),
      manifest: fromManifest.map((icon) => icon.src),
    };
    if (head.length > 0 || fromManifest.length > 0) return { status: "pass", observed };

    return {
      status: "fail",
      observed,
      message:
        'Page declares no icon: no `<link rel="icon">`, and no icons from a manifest. ' +
        "Consumers fall back to `/favicon.ico` if the site happens to serve one.",
      origin: { kind: "link", rel: "icon" },
    };
  },
};

const iconsAppleTouchMissing: BooleanRule = {
  id: "icons.apple-touch.missing",
  kind: "boolean",
  category: "icons",
  severity: "info",
  title: "Declare an `apple-touch-icon` for the iOS home screen",
  why:
    'iOS does not read `rel="icon"` for a home-screen shortcut. With no ' +
    "`apple-touch-icon` it screenshots the page instead, so what someone saved " +
    "is a thumbnail of whatever was on screen when they saved it.",
  rigor: "vendor-spec",
  sources: ["apple-web-apps", "whatwg-html-link-types"],
  reads: ["links.icons", "links.manifest"],
  expected: 'a `<link rel="apple-touch-icon">`',
  relates: ["icons.missing"],
  evaluate: (ex) => {
    const head = declaredIcons(ex);
    // A page that declares no icon at all is `icons.missing`'s to report;
    // asking it for the Apple flavour on top would be a second finding about
    // the same absence.
    if (head.length === 0) return { status: "na", observed: null };

    const apple = head.filter((icon) => APPLE_ICON_RELS.has(icon.rel.trim().toLowerCase()));
    const observed = head.map((icon) => icon.rel);
    if (apple.length > 0) return { status: "pass", observed };

    return {
      status: "fail",
      observed,
      message: `Page declares icons (${observed.join(", ")}) but no \`apple-touch-icon\`; iOS will screenshot the page instead.`,
      origin: { kind: "link", rel: "apple-touch-icon" },
    };
  },
};

const iconsManifestMismatch: BooleanRule = {
  id: "icons.manifest-mismatch",
  kind: "boolean",
  category: "icons",
  severity: "info",
  title: "The manifest and the `<head>` must not disagree about the same icon",
  why:
    "Two files declare the icons, maintained by different hands, and nothing " +
    "compares them. The failure worth naming is not that the two lists differ " +
    "— they legitimately do, since an apple-touch-icon is not a manifest icon " +
    "— but that they describe the *same file* differently, or that the icons " +
    "exist only in the manifest, where a browser tab never looks.",
  rigor: "guideline",
  sources: ["w3c-appmanifest", "whatwg-html-link-types"],
  reads: ["links.icons", "links.manifest"],
  expected: "the same size and type wherever an icon is declared twice",
  relates: ["icons.missing"],
  evaluate: (ex) => {
    const manifest = ex.links.manifest;
    // No manifest, none fetched, none parsed, or one that declares no icons:
    // nothing to compare. `parsed === undefined` is "never looked at", which
    // is not evidence about the site.
    if (!manifest?.parsed || !manifest.icons || manifest.icons.length === 0) {
      return { status: "na", observed: null };
    }

    const head = declaredIcons(ex);
    const observed = {
      head: head.map((icon) => ({ href: icon.href, sizes: icon.sizes ?? null })),
      manifest: manifest.icons.map((icon) => ({ src: icon.src, sizes: icon.sizes ?? null })),
    };

    if (head.length === 0) {
      return {
        status: "fail",
        observed,
        message: `Manifest declares ${manifest.icons.length} icon(s) but the \`<head>\` declares none; a browser tab reads the \`<head>\`, not the manifest.`,
        origin: { kind: "link", rel: "manifest" },
      };
    }

    // Same file, two declarations. Compare on the trailing path so a manifest
    // writing `/icon.png` and a `<link>` resolved to an absolute URL are still
    // recognised as one file.
    const disagreements: string[] = [];
    for (const icon of manifest.icons) {
      const twin = head.find((candidate) => sameAsset(candidate.href, icon.src));
      if (!twin) continue;
      if (icon.sizes && twin.sizes && normalise(icon.sizes) !== normalise(twin.sizes)) {
        disagreements.push(
          `\`${icon.src}\` is \`${twin.sizes}\` in the \`<head>\` and \`${icon.sizes}\` in the manifest`,
        );
      }
      if (icon.type && twin.type && icon.type.toLowerCase() !== twin.type.toLowerCase()) {
        disagreements.push(
          `\`${icon.src}\` is \`${twin.type}\` in the \`<head>\` and \`${icon.type}\` in the manifest`,
        );
      }
    }

    if (disagreements.length === 0) return { status: "pass", observed };
    return {
      status: "fail",
      observed,
      message: `The manifest and the \`<head>\` describe the same icon differently: ${disagreements.join("; ")}.`,
      origin: { kind: "link", rel: "manifest" },
    };
  },
};

const ogImageReachable: BooleanRule = {
  id: "og.image.reachable",
  kind: "boolean",
  category: "opengraph",
  severity: "error",
  title: "The URL in `og:image` has to answer with an image",
  why:
    "Every other check on a preview image judges the tag. This one judges the " +
    "file, and it is the only one that can catch the failure with no symptom: " +
    "a URL that is present, well-formed, absolute — and dead. The card renders " +
    "empty and nothing in the page says why. Found on this project's own " +
    "documentation, where eleven pages pointed at a route a redirect had been " +
    "swallowing since the day it was written.",
  rigor: "vendor-spec",
  sources: ["ogp", "meta-og-sharing"],
  reads: ["openGraph.images", "assets"],
  expected: "a 2xx image at every `og:image` URL",
  relates: ["og.image.missing", "og.image.absolute"],
  evaluate: (ex) => {
    // No probe pass ran. Reporting an absence goflag never checked for would
    // be inventing a finding.
    if (!ex.assets) return { status: "na", observed: null };

    const probed = ex.openGraph.images
      .map((image) => ex.assets?.[image.url.value.trim()])
      .filter((probe): probe is NonNullable<typeof probe> => probe !== undefined);
    if (probed.length === 0) return { status: "na", observed: null };

    const observed = probed.map((probe) => ({
      status: probe.status,
      contentType: probe.contentType ?? null,
    }));
    const dead = probed.filter((probe) => !probe.ok);
    if (dead.length === 0) return { status: "pass", observed };

    return {
      status: "fail",
      observed,
      message: `\`og:image\` does not serve an image: ${dead
        .map((probe) => describeAsset(probe.status, probe.contentType))
        .join("; ")}. The preview card will render without it.`,
      origin: { kind: "meta", property: "og:image" },
    };
  },
};

const iconsUnreachable: BooleanRule = {
  id: "icons.unreachable",
  kind: "boolean",
  category: "icons",
  severity: "warning",
  title: "A declared icon has to answer with an image",
  why:
    "An icon that 404s is worse than one never declared: the client asks, " +
    "gets nothing, and has already skipped the `/favicon.ico` it would have " +
    "fallen back to. The declaration is what took the fallback away.",
  rigor: "vendor-spec",
  sources: ["whatwg-html-link-types", "mdn-link-rel"],
  reads: ["links.icons", "assets"],
  expected: "a 2xx image at every declared icon URL",
  relates: ["icons.missing", "icons.ico.missing"],
  evaluate: (ex) => {
    if (!ex.assets) return { status: "na", observed: null };

    const probed = declaredIcons(ex)
      .map((icon) => ({ icon, probe: ex.assets?.[icon.href] }))
      .filter((pair): pair is { icon: ExtractionIcon; probe: ExtractionAsset } =>
        Boolean(pair.probe),
      );
    if (probed.length === 0) return { status: "na", observed: null };

    const observed = probed.map(({ icon, probe }) => ({
      rel: icon.rel,
      href: icon.href,
      status: probe.status,
    }));
    const dead = probed.filter(({ probe }) => !probe.ok);
    if (dead.length === 0) return { status: "pass", observed };

    return {
      status: "fail",
      observed,
      message: `Declared icon does not serve an image: ${dead
        .map(
          ({ icon, probe }) =>
            `\`${icon.rel}\` → \`${icon.href}\` (${describeAsset(probe.status, probe.contentType)})`,
        )
        .join("; ")}.`,
      origin: { kind: "link", rel: "icon" },
    };
  },
};

const iconsSizesMismatch: BooleanRule = {
  id: "icons.sizes-mismatch",
  kind: "boolean",
  category: "icons",
  severity: "info",
  title: "A `sizes` attribute must describe the file it points at",
  why:
    "`sizes` is how a client picks one icon out of several without fetching " +
    "them all, so a wrong value costs exactly what the attribute was there to " +
    "save: the client downloads the file it was told to prefer and gets the " +
    "wrong resolution. A half-true declaration is the common shape — a `.ico` " +
    "carrying 16, 32 and 48 declared as `48x48` advertises one third of itself.",
  rigor: "guideline",
  sources: ["whatwg-html-link-types", "mdn-link-rel"],
  reads: ["links.icons", "assets"],
  expected: "`sizes` listing what the file actually contains",
  relates: ["icons.unreachable"],
  evaluate: (ex) => {
    if (!ex.assets) return { status: "na", observed: null };

    const comparable = declaredIcons(ex)
      .map((icon) => ({ icon, probe: ex.assets?.[icon.href] }))
      .filter(
        (pair): pair is { icon: ExtractionIcon; probe: ExtractionAsset } =>
          // Only where both sides said something. `any` declares no dimension
          // to check, and a format goflag does not decode leaves `sizes`
          // absent — which means unknown, and unknown is not a mismatch.
          Boolean(pair.probe?.ok && pair.probe.sizes?.length) &&
          pair.icon.parsedSizes.some((size) => size !== "any"),
      );
    if (comparable.length === 0) return { status: "na", observed: null };

    const observed = comparable.map(({ icon, probe }) => ({
      href: icon.href,
      declared: icon.sizes ?? null,
      actual: (probe.sizes ?? []).map((size) => `${size.width}x${size.height}`),
    }));

    const wrong = observed.filter((entry) => {
      const declared = new Set(
        comparable
          .find((pair) => pair.icon.href === entry.href)!
          .icon.parsedSizes.filter((size) => size !== "any")
          .map((size) => `${size.width}x${size.height}`),
      );
      const actual = new Set(entry.actual);
      // Set equality: a declaration that omits sizes the file carries is as
      // wrong as one that claims sizes it does not.
      return declared.size !== actual.size || [...declared].some((size) => !actual.has(size));
    });

    if (wrong.length === 0) return { status: "pass", observed };
    return {
      status: "fail",
      observed,
      message: `\`sizes\` does not describe the file: ${wrong
        .map(
          (entry) =>
            `\`${entry.href}\` declares \`${entry.declared}\` and contains ${entry.actual.join(", ")}`,
        )
        .join("; ")}.`,
      origin: { kind: "link", rel: "icon" },
    };
  },
};

const robotsConflict: BooleanRule = {
  id: "robots.conflict",
  kind: "boolean",
  category: "robots",
  severity: "error",
  title: "`robots`, `googlebot`, and `X-Robots-Tag` must not contradict each other",
  why:
    "When directives conflict, crawlers resolve them with the most " +
    "restrictive interpretation — a stray `noindex` wins over the `index` " +
    "you meant, and the page silently drops out of search.",
  rigor: "vendor-spec",
  sources: ["google-robots-meta"],
  reads: ["meta.robots", "meta.googlebot", "http.headers"],
  expected: "consistent indexing directives across meta tags and headers",
  evaluate: (ex) => {
    const candidates: Array<{ name: string; tokens: Set<string>; origin: TagOrigin }> = [
      {
        name: "meta robots",
        tokens: new Set(tokens(ex.meta.robots?.value)),
        origin: { kind: "meta", name: "robots" },
      },
      {
        name: "meta googlebot",
        tokens: new Set(tokens(ex.meta.googlebot?.value)),
        origin: { kind: "meta", name: "googlebot" },
      },
      {
        name: "X-Robots-Tag header",
        tokens: new Set(tokens(ex.http.headers["x-robots-tag"])),
        origin: { kind: "header", name: "x-robots-tag" },
      },
    ];
    const declarations = candidates.filter((d) => d.tokens.size > 0);

    const observed = Object.fromEntries(declarations.map((d) => [d.name, [...d.tokens].sort()]));
    if (declarations.length < 2) return { status: "na", observed };

    const conflicts: string[] = [];
    let origin: TagOrigin | undefined;
    for (const [negative, positive] of [
      ["noindex", "index"],
      ["nofollow", "follow"],
    ] as const) {
      const sayNo = declarations.filter((d) => d.tokens.has(negative));
      const sayYes = declarations.filter((d) => d.tokens.has(positive) && !d.tokens.has(negative));
      if (sayNo.length > 0 && sayYes.length > 0) {
        conflicts.push(
          `${sayNo.map((d) => d.name).join(", ")} say \`${negative}\`, ${sayYes.map((d) => d.name).join(", ")} say \`${positive}\``,
        );
        origin ??= sayNo[0]!.origin;
      }
    }

    if (conflicts.length === 0) return { status: "pass", observed };
    return {
      status: "fail",
      observed,
      message: `Conflicting robots directives: ${conflicts.join("; ")}.`,
      origin,
    };
  },
};

/** The full set of rules, alphabetised by id (stable output order). */
export const RULES: ReadonlyArray<Rule> = [
  canonicalAbsolute,
  canonicalMissing,
  descriptionLength,
  descriptionMissing,
  iconsAppleTouchMissing,
  iconsManifestMismatch,
  iconsMissing,
  iconsSizesMismatch,
  iconsUnreachable,
  ogDescriptionMissing,
  ogImageAbsolute,
  ogImageAlt,
  ogImageDimensions,
  ogImageMissing,
  ogImageRatio,
  ogImageReachable,
  ogLocaleAlternates,
  ogLocaleMissing,
  ogTitleMissing,
  robotsConflict,
  titleLength,
  titleMissing,
  viewportMissing,
];

const RULE_BY_ID: Map<string, Rule> = new Map(RULES.map((r) => [r.id, r]));

export function getRule(id: string): Rule | undefined {
  return RULE_BY_ID.get(id);
}

export type { BooleanRule, Rule, RuleFinding, ScoredRule } from "./types";
