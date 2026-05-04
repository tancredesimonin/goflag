/**
 * Headlint preview layer — type contracts.
 *
 * Each preview component renders a single platform's link-unfurl card. The
 * truth source is always a {@link Page}, but every preview also needs:
 *
 *   1. **What value did this platform actually display?** Most platforms
 *      have their own precedence rules ("twitter:title beats og:title beats
 *      <title>"), so we resolve a single {@link PreviewData} per platform
 *      ahead of time and feed it to the component.
 *   2. **Which tags fed which fields?** Phase 4 ships a per-card footer
 *      that surfaces fallbacks ("no og:title → fell back to <title>"); this
 *      is also what the rule engine and the "What if?" toggle hook into.
 *   3. **What if a tag were removed?** Users can toggle individual tags off
 *      to see each preview degrade. The toggle is implemented by passing a
 *      `Set<TagKey>` to the resolver; the resolver re-runs with those tags
 *      treated as absent.
 *
 * Design notes:
 *
 *  - This module is pure TypeScript with no React imports — it lives next
 *    to the component code under `src/lib/previews/` for cohesion, but the
 *    resolver must remain importable from a Node CLI / engine context.
 *  - {@link TagKey} is the canonical, stable identifier we use to address a
 *    raw tag from the UI (toggle-off, jump-to in Raw view) and from rules.
 *    It MUST round-trip through {@link tagKey} / {@link tagKeyFromOrigin}.
 */

import type { Page, TagOrigin } from "@/lib/core/types";

/**
 * Stable identifier for a single raw tag in the source HTML.
 *
 * Format examples:
 *
 *  - `"title"` — document `<title>` element
 *  - `"meta:name=description"` — `<meta name="description">`
 *  - `"meta:property=og:image"` — `<meta property="og:image">`
 *  - `"meta:http-equiv=content-language"` — `<meta http-equiv="…">`
 *  - `"link:rel=canonical"` — `<link rel="canonical">`
 *  - `"link:rel=icon"` — note: rel-only (multiple icons share a key)
 *  - `"html:lang"` — `<html lang>` attribute
 *  - `"json-ld:0:Organization"` — first JSON-LD block, top-level @type
 *
 * The key is deliberately coarse-grained: toggling off `meta:property=og:image`
 * removes _all_ `og:image*` siblings (image, image:width, image:height,
 * image:alt, secure_url, type) because that's how the resolver thinks about
 * "the og:image is gone". This matches user intent for the "What if?" toggle
 * and keeps the toggle UI sensible. Sibling-removal is implemented inside
 * {@link resolvePreview}; the key itself stays simple.
 */
export type TagKey = string;

/**
 * A piece of data that ended up on a preview card, plus the trail that led
 * to it. Used by the per-card footer and by the "What if?" toggle.
 */
export interface PreviewField<T> {
  /** The value the platform would render. `undefined` when no source had it. */
  value: T | undefined;
  /** The source we ended up using (first non-empty in `fallbackChain`). */
  source?: PreviewSource;
  /**
   * Ordered list of sources we considered for this field, with the value we
   * found at each step. This is what powers the "fell back to X" footer:
   * the first entry is what the platform _ideally_ wants, subsequent
   * entries are degradations.
   */
  fallbackChain: PreviewSourceProbe[];
}

/**
 * A single tag/source we tried during resolution. `value === undefined`
 * means we looked but found nothing (and therefore moved on to the next
 * step in the chain).
 */
export interface PreviewSourceProbe {
  source: PreviewSource;
  value: string | number | undefined;
}

/**
 * Where a field on a preview came from. Mirrors {@link TagOrigin} but with
 * a `key` so the UI can wire it to a {@link TagKey} for toggling, and a
 * human-readable `label` for the footer copy.
 */
export interface PreviewSource {
  /** Stable {@link TagKey} for this source, or a synthetic key for derived data. */
  key: TagKey;
  /** `<meta property="og:image">` style label for the footer copy. */
  label: string;
  /** The raw {@link TagOrigin} when this source maps to one tag. */
  origin?: TagOrigin;
}

/**
 * The resolved view a single platform would render. This is intentionally
 * minimal — every preview needs essentially the same atomic fields (title,
 * description, image, site, etc.). Platform-specific quirks (X card type,
 * Discord theme color) live alongside as optional extras.
 */
export interface PreviewData {
  platform: PreviewPlatform;
  title: PreviewField<string>;
  description: PreviewField<string>;
  image: PreviewField<PreviewImage>;
  siteName: PreviewField<string>;
  /** Display URL — what the user sees in the card chrome (host + path). */
  url: PreviewField<string>;
  /** Best favicon to render in the card chrome. */
  favicon: PreviewField<string>;
  /** Platform-specific extras. */
  extras: PreviewExtras;
  /**
   * Flat list of tags this preview actually consumed (in order of appearance
   * on the card). Used by the footer and for "Used X tags" counters.
   */
  consumed: PreviewSource[];
}

export interface PreviewImage {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
  /** Aspect ratio (`width / height`), when both dims are known. */
  ratio?: number;
}

export interface PreviewExtras {
  /** X / Twitter card type when set. */
  twitterCard?: string;
  /** Discord embed accent color from `<meta name="theme-color">`. */
  themeColor?: string;
  /** Twitter handle for the `via @site` chip. */
  twitterSite?: string;
  /** Twitter creator handle. */
  twitterCreator?: string;
}

export type PreviewPlatform =
  | "google-serp-desktop"
  | "google-serp-mobile"
  | "x-card-summary-large"
  | "x-card-summary"
  | "facebook"
  | "linkedin"
  | "discord"
  | "slack"
  | "whatsapp"
  | "imessage"
  | "pinterest";

export const PREVIEW_PLATFORMS: ReadonlyArray<{
  id: PreviewPlatform;
  name: string;
  group: "search" | "social" | "messaging";
}> = [
  { id: "google-serp-desktop", name: "Google (desktop)", group: "search" },
  { id: "google-serp-mobile", name: "Google (mobile)", group: "search" },
  { id: "x-card-summary-large", name: "X (large image)", group: "social" },
  { id: "x-card-summary", name: "X (summary)", group: "social" },
  { id: "facebook", name: "Facebook", group: "social" },
  { id: "linkedin", name: "LinkedIn", group: "social" },
  { id: "pinterest", name: "Pinterest", group: "social" },
  { id: "discord", name: "Discord", group: "messaging" },
  { id: "slack", name: "Slack", group: "messaging" },
  { id: "whatsapp", name: "WhatsApp", group: "messaging" },
  { id: "imessage", name: "iMessage", group: "messaging" },
];

/**
 * Input to a preview component. Always pre-resolved — components never see
 * the raw {@link Page} directly so they stay easy to fixture in tests.
 */
export interface PreviewProps {
  data: PreviewData;
  /** Source page (kept around so the footer can deep-link into the Raw tab). */
  page: Page;
}
