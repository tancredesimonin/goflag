/**
 * `@goflag/next` — declare a site's routes once, derive what belongs in the
 * HTML from them.
 *
 * The runtime depends on nothing (invariant I1): `next` is a peer, and only its
 * `Metadata` / `MetadataRoute` types are used, which are erased at build. The
 * library reads no environment variable — the site computes its origin and its
 * indexability, and passes them in.
 */

export { defineSite, type Site, type SiteInput, type LocaleTags } from "./site";
export {
  collection,
  defineRoutes,
  type CollectionFamily,
  type FamilyInput,
  type RouteInput,
  type RobotsOptions,
  type Routes,
  type SitemapFacts,
  type SitemapOptions,
} from "./routes";
export { buildMetadata, type RouteContent, type RouteImage } from "./metadata";
export { clusterOf, locate } from "./locate";
export {
  isLanguage,
  isRegion,
  localeIdentity,
  lookup,
  toBcp47,
  toOpenGraphLocale,
  type Language,
  type Region,
  type ValidTag,
} from "./locale";
export type { LocalizedRoute, MonolingualRoute, OgType, PageLocation, Route } from "./types";
