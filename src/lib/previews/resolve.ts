/**
 * Per-platform resolution: given a {@link Page} and an optional set of
 * suppressed {@link TagKey}s, compute the {@link PreviewData} for one
 * platform. Pure logic; safe to import from anywhere.
 *
 * The resolver is the heart of Phase 4. It encodes each platform's
 * documented precedence rules ("X looks at twitter:X first, falls back to
 * og:X") and records every probe so the per-card footer can explain the
 * fallback chain to the user.
 */

import type { Page, RawMetaTag, TagOrigin } from "@/lib/core/types";
import { HTML_LANG_KEY, TITLE_KEY, isSuppressed, linkSuppressed, metaSuppressed } from "./tag-key";
import type {
  PreviewData,
  PreviewField,
  PreviewImage,
  PreviewPlatform,
  PreviewSource,
  PreviewSourceProbe,
} from "./types";

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface ResolveOptions {
  /** Tags the user toggled off ("what if X were missing?"). */
  removed?: ReadonlySet<string>;
}

/**
 * Resolve a single platform's preview view. The returned {@link PreviewData}
 * is everything a preview component needs to render — components never see
 * the raw {@link Page}.
 */
export function resolvePreview(
  platform: PreviewPlatform,
  page: Page,
  opts: ResolveOptions = {},
): PreviewData {
  const removed = opts.removed ?? new Set<string>();
  switch (platform) {
    case "google-serp-desktop":
    case "google-serp-mobile":
      return resolveGoogle(platform, page, removed);
    case "x-card-summary-large":
    case "x-card-summary":
      return resolveX(platform, page, removed);
    case "facebook":
      return resolveFacebook(page, removed);
    case "linkedin":
      return resolveLinkedIn(page, removed);
    case "discord":
      return resolveDiscord(page, removed);
    case "slack":
      return resolveSlack(page, removed);
    case "whatsapp":
      return resolveWhatsApp(page, removed);
    case "imessage":
      return resolveImessage(page, removed);
    case "pinterest":
      return resolvePinterest(page, removed);
  }
}

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

function source(key: string, label: string, origin?: TagOrigin): PreviewSource {
  return { key, label, origin };
}

/** Build a {@link PreviewField} from an ordered chain of probe attempts. */
function fieldFromChain<T extends string | number>(chain: PreviewSourceProbe[]): PreviewField<T> {
  const hit = chain.find((p) => p.value !== undefined && p.value !== "");
  return {
    value: hit?.value as T | undefined,
    source: hit?.source,
    fallbackChain: chain,
  };
}

/** As above but for image fields (which carry width/height/alt). */
function imageField(chain: PreviewImageProbe[]): PreviewField<PreviewImage> {
  const hit = chain.find((p) => p.value !== undefined);
  return {
    value: hit?.value,
    source: hit?.source,
    fallbackChain: chain.map((p) => ({
      source: p.source,
      value: p.value?.url,
    })),
  };
}

interface PreviewImageProbe {
  source: PreviewSource;
  value: PreviewImage | undefined;
}

/**
 * Read a `<meta>` value from `Page.raw.metas`, respecting suppressed tags.
 * Matches by `property` OR `name` (lowercased).
 */
function readMeta(
  page: Page,
  attr: "property" | "name",
  needle: string,
  removed: ReadonlySet<string>,
): { value: string | undefined; meta?: RawMetaTag } {
  const wanted = needle.toLowerCase();
  for (const meta of page.raw.metas) {
    const candidate = (meta[attr] ?? "").toLowerCase();
    if (candidate !== wanted) continue;
    if (metaSuppressed(meta, removed)) return { value: undefined, meta };
    const v = (meta.content ?? "").trim();
    return { value: v === "" ? undefined : v, meta };
  }
  return { value: undefined };
}

/** Read the document `<title>`, respecting suppression. */
function readTitle(page: Page, removed: ReadonlySet<string>): string | undefined {
  if (isSuppressed(TITLE_KEY, removed)) return undefined;
  const t = page.raw.title?.trim();
  return t === "" ? undefined : t;
}

/** Read `<html lang>`, respecting suppression. */
function readHtmlLang(page: Page, removed: ReadonlySet<string>): string | undefined {
  if (isSuppressed(HTML_LANG_KEY, removed)) return undefined;
  return page.raw.htmlLang;
}

/** Read the canonical URL from a parsed link if not suppressed. */
function readCanonical(page: Page, removed: ReadonlySet<string>): string | undefined {
  for (const link of page.raw.links) {
    if (link.rel.toLowerCase() !== "canonical") continue;
    if (linkSuppressed(link, removed)) return undefined;
    return link.href;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Image collection
// ---------------------------------------------------------------------------

/**
 * Collect every og:image candidate from the raw metas, in document order,
 * coalescing each `og:image` with its trailing `og:image:width`,
 * `og:image:height`, `og:image:alt`, `og:image:secure_url` siblings.
 * Suppressed tags are skipped.
 */
function readOgImages(page: Page, removed: ReadonlySet<string>): PreviewImage[] {
  const images: PreviewImage[] = [];
  let current: PreviewImage | undefined;

  for (const meta of page.raw.metas) {
    const prop = (meta.property ?? "").toLowerCase();
    if (!prop.startsWith("og:image")) continue;
    if (metaSuppressed(meta, removed)) continue;
    const content = (meta.content ?? "").trim();

    if (prop === "og:image" || prop === "og:image:url") {
      if (content) {
        current = { url: content };
        images.push(current);
      }
      continue;
    }
    if (!current) continue;
    if (prop === "og:image:secure_url" && content) current.url = content;
    else if (prop === "og:image:alt") current.alt = content;
    else if (prop === "og:image:width") {
      const w = Number.parseInt(content, 10);
      if (Number.isFinite(w)) current.width = w;
    } else if (prop === "og:image:height") {
      const h = Number.parseInt(content, 10);
      if (Number.isFinite(h)) current.height = h;
    }
  }

  for (const img of images) {
    if (img.width && img.height && img.height > 0) {
      img.ratio = img.width / img.height;
    }
  }
  return images;
}

/**
 * Pick a favicon to display in card chrome. Priority: `apple-touch-icon`,
 * then largest `icon`, then any `icon`, falling back to `/favicon.ico`.
 */
function pickFavicon(
  page: Page,
  removed: ReadonlySet<string>,
): { url: string | undefined; origin?: TagOrigin } {
  const live = page.raw.links.filter((l) => !linkSuppressed(l, removed));
  const apple = live.find((l) => l.rel.toLowerCase() === "apple-touch-icon");
  if (apple?.href) {
    return { url: apple.href, origin: { kind: "link", rel: "apple-touch-icon" } };
  }
  const icons = live.filter((l) => /^(?:shortcut icon|icon|mask-icon)$/i.test(l.rel));
  if (icons.length > 0) {
    const sorted = [...icons].sort((a, b) => maxSizeOf(b) - maxSizeOf(a));
    const best = sorted[0]!;
    if (best.href) return { url: best.href, origin: { kind: "link", rel: best.rel } };
  }
  // Convention fallback: /favicon.ico relative to the document URL.
  try {
    const u = new URL("/favicon.ico", page.fetch.finalUrl);
    return { url: u.toString(), origin: { kind: "computed" } };
  } catch {
    return { url: undefined };
  }
}

function maxSizeOf(link: { sizes?: string }): number {
  if (!link.sizes) return 0;
  const sizes = link.sizes.split(/\s+/).map((s) => {
    const m = /^(\d+)x(\d+)$/i.exec(s);
    if (!m) return 0;
    return Number.parseInt(m[1]!, 10) * Number.parseInt(m[2]!, 10);
  });
  return Math.max(0, ...sizes);
}

/**
 * Pretty host + path slug used by Google SERP and X cards. We deliberately
 * mirror what each platform shows: host without `www.`, no trailing slash.
 */
export function displayUrl(input: string): string {
  try {
    const u = new URL(input);
    const host = u.host.replace(/^www\./, "");
    let path = u.pathname.replace(/\/$/, "");
    if (path === "") path = "";
    return `${host}${path}${u.search}`;
  } catch {
    return input;
  }
}

export function displayHost(input: string): string {
  try {
    return new URL(input).host.replace(/^www\./, "");
  } catch {
    return input;
  }
}

// ---------------------------------------------------------------------------
// Chain builders shared across platforms
// ---------------------------------------------------------------------------

interface CommonResolution {
  url: PreviewField<string>;
  favicon: PreviewField<string>;
  consumedAppend: PreviewSource[];
}

function resolveCommon(page: Page, removed: ReadonlySet<string>): CommonResolution {
  const canonical = readCanonical(page, removed);
  const ogUrl = readMeta(page, "property", "og:url", removed).value;
  const fav = pickFavicon(page, removed);

  const consumed: PreviewSource[] = [];
  if (canonical) consumed.push(source("link:rel=canonical", '<link rel="canonical">'));
  else if (ogUrl) consumed.push(source("meta:property=og:url", '<meta property="og:url">'));

  return {
    url: fieldFromChain<string>([
      {
        source: source("link:rel=canonical", '<link rel="canonical">'),
        value: canonical,
      },
      {
        source: source("meta:property=og:url", '<meta property="og:url">'),
        value: ogUrl,
      },
      {
        source: source("computed:final-url", "fetched URL"),
        value: page.fetch.finalUrl,
      },
    ]),
    favicon: fieldFromChain<string>([
      {
        source: source(
          fav.origin && fav.origin.kind === "link"
            ? `link:rel=${fav.origin.rel.toLowerCase()}`
            : "computed:favicon-fallback",
          fav.origin?.kind === "link"
            ? `<link rel="${fav.origin.rel}">`
            : "/favicon.ico (convention)",
        ),
        value: fav.url,
      },
    ]),
    consumedAppend: consumed,
  };
}

// ---------------------------------------------------------------------------
// Google SERP
// ---------------------------------------------------------------------------

function resolveGoogle(
  platform: "google-serp-desktop" | "google-serp-mobile",
  page: Page,
  removed: ReadonlySet<string>,
): PreviewData {
  // Google: <title> is canonical, og:title only used as a last resort.
  // Description: <meta name="description"> first, then og:description.
  const title = readTitle(page, removed);
  const ogTitle = readMeta(page, "property", "og:title", removed).value;
  const desc = readMeta(page, "name", "description", removed).value;
  const ogDesc = readMeta(page, "property", "og:description", removed).value;
  const siteName = readMeta(page, "property", "og:site_name", removed).value;
  const common = resolveCommon(page, removed);

  const titleField = fieldFromChain<string>([
    { source: source(TITLE_KEY, "<title>"), value: title },
    { source: source("meta:property=og:title", '<meta property="og:title">'), value: ogTitle },
  ]);
  const descField = fieldFromChain<string>([
    {
      source: source("meta:name=description", '<meta name="description">'),
      value: desc,
    },
    {
      source: source("meta:property=og:description", '<meta property="og:description">'),
      value: ogDesc,
    },
  ]);

  const consumed: PreviewSource[] = [];
  if (titleField.source) consumed.push(titleField.source);
  if (descField.source) consumed.push(descField.source);
  consumed.push(...common.consumedAppend);
  if (common.favicon.source) consumed.push(common.favicon.source);
  if (siteName) {
    consumed.push(source("meta:property=og:site_name", '<meta property="og:site_name">'));
  }

  return {
    platform,
    title: titleField,
    description: descField,
    image: imageField([]),
    siteName: fieldFromChain<string>([
      {
        source: source("meta:property=og:site_name", '<meta property="og:site_name">'),
        value: siteName,
      },
    ]),
    url: common.url,
    favicon: common.favicon,
    extras: {},
    consumed,
  };
}

// ---------------------------------------------------------------------------
// X / Twitter
// ---------------------------------------------------------------------------

function resolveX(
  platform: "x-card-summary-large" | "x-card-summary",
  page: Page,
  removed: ReadonlySet<string>,
): PreviewData {
  const card = readMeta(page, "name", "twitter:card", removed).value;
  const tTitle = readMeta(page, "name", "twitter:title", removed).value;
  const ogTitle = readMeta(page, "property", "og:title", removed).value;
  const docTitle = readTitle(page, removed);
  const tDesc = readMeta(page, "name", "twitter:description", removed).value;
  const ogDesc = readMeta(page, "property", "og:description", removed).value;
  const tImage = readMeta(page, "name", "twitter:image", removed).value;
  const tImageAlt = readMeta(page, "name", "twitter:image:alt", removed).value;
  const tSite = readMeta(page, "name", "twitter:site", removed).value;
  const tCreator = readMeta(page, "name", "twitter:creator", removed).value;
  const ogImages = readOgImages(page, removed);
  const common = resolveCommon(page, removed);

  const titleField = fieldFromChain<string>([
    { source: source("meta:name=twitter:title", '<meta name="twitter:title">'), value: tTitle },
    { source: source("meta:property=og:title", '<meta property="og:title">'), value: ogTitle },
    { source: source(TITLE_KEY, "<title>"), value: docTitle },
  ]);
  const descField = fieldFromChain<string>([
    {
      source: source("meta:name=twitter:description", '<meta name="twitter:description">'),
      value: tDesc,
    },
    {
      source: source("meta:property=og:description", '<meta property="og:description">'),
      value: ogDesc,
    },
  ]);

  const imgChain: PreviewImageProbe[] = [
    {
      source: source("meta:name=twitter:image", '<meta name="twitter:image">'),
      value: tImage ? { url: tImage, alt: tImageAlt } : undefined,
    },
  ];
  if (ogImages[0]) {
    imgChain.push({
      source: source("meta:property=og:image", '<meta property="og:image">'),
      value: ogImages[0],
    });
  } else {
    imgChain.push({
      source: source("meta:property=og:image", '<meta property="og:image">'),
      value: undefined,
    });
  }
  const imageF = imageField(imgChain);

  const consumed: PreviewSource[] = [];
  if (titleField.source) consumed.push(titleField.source);
  if (descField.source) consumed.push(descField.source);
  if (imageF.source) consumed.push(imageF.source);
  if (card) consumed.push(source("meta:name=twitter:card", '<meta name="twitter:card">'));
  consumed.push(...common.consumedAppend);

  return {
    platform,
    title: titleField,
    description: descField,
    image: imageF,
    siteName: fieldFromChain<string>([]),
    url: common.url,
    favicon: common.favicon,
    extras: {
      twitterCard: card,
      twitterSite: tSite,
      twitterCreator: tCreator,
    },
    consumed,
  };
}

// ---------------------------------------------------------------------------
// Open Graph consumers (Facebook / LinkedIn / Discord / Slack / WA / iMessage / Pinterest)
// ---------------------------------------------------------------------------

interface OgChainOptions {
  /** Override the title fallback chain (Slack uses og:site_name above title). */
  prependTitleFallbacks?: PreviewSourceProbe[];
}

function resolveOgConsumer(
  page: Page,
  removed: ReadonlySet<string>,
  platform: PreviewPlatform,
  opts: OgChainOptions = {},
): PreviewData {
  const ogTitle = readMeta(page, "property", "og:title", removed).value;
  const docTitle = readTitle(page, removed);
  const ogDesc = readMeta(page, "property", "og:description", removed).value;
  const metaDesc = readMeta(page, "name", "description", removed).value;
  const siteName = readMeta(page, "property", "og:site_name", removed).value;
  const themeColor = readMeta(page, "name", "theme-color", removed).value;
  const ogImages = readOgImages(page, removed);
  const common = resolveCommon(page, removed);

  const titleChain: PreviewSourceProbe[] = [
    ...(opts.prependTitleFallbacks ?? []),
    { source: source("meta:property=og:title", '<meta property="og:title">'), value: ogTitle },
    { source: source(TITLE_KEY, "<title>"), value: docTitle },
  ];
  const descChain: PreviewSourceProbe[] = [
    {
      source: source("meta:property=og:description", '<meta property="og:description">'),
      value: ogDesc,
    },
    {
      source: source("meta:name=description", '<meta name="description">'),
      value: metaDesc,
    },
  ];
  const imgChain: PreviewImageProbe[] = ogImages[0]
    ? [
        {
          source: source("meta:property=og:image", '<meta property="og:image">'),
          value: ogImages[0],
        },
      ]
    : [
        {
          source: source("meta:property=og:image", '<meta property="og:image">'),
          value: undefined,
        },
      ];

  const titleField = fieldFromChain<string>(titleChain);
  const descField = fieldFromChain<string>(descChain);
  const imageF = imageField(imgChain);

  const consumed: PreviewSource[] = [];
  if (titleField.source) consumed.push(titleField.source);
  if (descField.source) consumed.push(descField.source);
  if (imageF.source) consumed.push(imageF.source);
  if (siteName) {
    consumed.push(source("meta:property=og:site_name", '<meta property="og:site_name">'));
  }
  consumed.push(...common.consumedAppend);

  return {
    platform,
    title: titleField,
    description: descField,
    image: imageF,
    siteName: fieldFromChain<string>([
      {
        source: source("meta:property=og:site_name", '<meta property="og:site_name">'),
        value: siteName,
      },
    ]),
    url: common.url,
    favicon: common.favicon,
    extras: {
      themeColor,
    },
    consumed,
  };
}

function resolveFacebook(page: Page, removed: ReadonlySet<string>): PreviewData {
  return resolveOgConsumer(page, removed, "facebook");
}

function resolveLinkedIn(page: Page, removed: ReadonlySet<string>): PreviewData {
  return resolveOgConsumer(page, removed, "linkedin");
}

function resolveDiscord(page: Page, removed: ReadonlySet<string>): PreviewData {
  return resolveOgConsumer(page, removed, "discord");
}

function resolveSlack(page: Page, removed: ReadonlySet<string>): PreviewData {
  return resolveOgConsumer(page, removed, "slack");
}

function resolveWhatsApp(page: Page, removed: ReadonlySet<string>): PreviewData {
  return resolveOgConsumer(page, removed, "whatsapp");
}

function resolveImessage(page: Page, removed: ReadonlySet<string>): PreviewData {
  // iMessage falls back to favicon when no og:image — encode that here so
  // the component is purely presentational.
  const data = resolveOgConsumer(page, removed, "imessage");
  if (data.image.value === undefined && data.favicon.value !== undefined) {
    data.image = {
      value: { url: data.favicon.value },
      source: data.favicon.source,
      fallbackChain: [
        ...data.image.fallbackChain,
        {
          source: data.favicon.source ?? source("computed:favicon", "favicon"),
          value: data.favicon.value,
        },
      ],
    };
    if (data.favicon.source) data.consumed.push(data.favicon.source);
  }
  return data;
}

function resolvePinterest(page: Page, removed: ReadonlySet<string>): PreviewData {
  return resolveOgConsumer(page, removed, "pinterest");
}

// ---------------------------------------------------------------------------
// Re-exports for convenience
// ---------------------------------------------------------------------------

export { readHtmlLang };
