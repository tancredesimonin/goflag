import type { HydrationDelta, RawLinkTag, RawMetaTag, Page } from "../types";

type ParsedSubset = Pick<Page, "raw" | "jsonLd">;

/**
 * Compute what changed between the static-pass parse and the headless-pass
 * parse of the same URL.
 *
 * The output is intentionally lossless for tags but small in absolute size:
 * we keep just the identifying attributes (`name` / `property` / `httpEquiv`
 * / `rel` / `hreflang`) and the raw `content` / `href` so Phase 5 rules can
 * say things like "your `og:image` is client-injected — Facebook's crawler
 * does not run JS". The full HTML for both passes is still available on
 * `Page.html` for richer downstream uses.
 */
export function computeHydrationDelta(
  staticPass: ParsedSubset,
  renderedPass: ParsedSubset,
): HydrationDelta {
  const staticMetaKeys = new Set(staticPass.raw.metas.map(metaKey));
  const renderedMetaKeys = new Set(renderedPass.raw.metas.map(metaKey));

  const clientInjectedMetas = renderedPass.raw.metas
    .filter((m) => !staticMetaKeys.has(metaKey(m)))
    .map(toMetaSummary);
  const clientRemovedMetas = staticPass.raw.metas
    .filter((m) => !renderedMetaKeys.has(metaKey(m)))
    .map(toMetaSummary);

  const staticLinkKeys = new Set(staticPass.raw.links.map(linkKey));
  const renderedLinkKeys = new Set(renderedPass.raw.links.map(linkKey));

  const clientInjectedLinks = renderedPass.raw.links
    .filter((l) => !staticLinkKeys.has(linkKey(l)))
    .map(toLinkSummary);
  const clientRemovedLinks = staticPass.raw.links
    .filter((l) => !renderedLinkKeys.has(linkKey(l)))
    .map(toLinkSummary);

  return {
    fromMode: "static",
    toMode: "headless",
    titleChanged: (staticPass.raw.title ?? "") !== (renderedPass.raw.title ?? ""),
    htmlLangChanged: (staticPass.raw.htmlLang ?? "") !== (renderedPass.raw.htmlLang ?? ""),
    clientInjectedMetas,
    clientRemovedMetas,
    clientInjectedLinks,
    clientRemovedLinks,
    jsonLdBlocksAdded: Math.max(0, renderedPass.jsonLd.length - staticPass.jsonLd.length),
  };
}

function metaKey(m: RawMetaTag): string {
  // Identity for "is this the same meta tag?" purposes. We deliberately
  // include `content` so that a tag whose value changed counts as both
  // a removal (old value) and an injection (new value) — that matches the
  // intent of the rules: "the value Slackbot sees differs from the one a
  // browser sees".
  return [
    "n=" + (m.name ?? ""),
    "p=" + (m.property ?? ""),
    "he=" + (m.httpEquiv ?? ""),
    "ch=" + (m.charset ?? ""),
    "c=" + (m.content ?? ""),
  ].join("|");
}

function linkKey(l: RawLinkTag): string {
  return [
    "r=" + (l.rel ?? ""),
    "h=" + (l.href ?? ""),
    "hl=" + (l.hreflang ?? ""),
    "t=" + (l.type ?? ""),
    "s=" + (l.sizes ?? ""),
  ].join("|");
}

function toMetaSummary(m: RawMetaTag) {
  const out: HydrationDelta["clientInjectedMetas"][number] = {};
  if (m.name) out.name = m.name;
  if (m.property) out.property = m.property;
  if (m.httpEquiv) out.httpEquiv = m.httpEquiv;
  if (m.content !== undefined) out.content = m.content;
  return out;
}

function toLinkSummary(l: RawLinkTag) {
  const out: HydrationDelta["clientInjectedLinks"][number] = { rel: l.rel };
  if (l.href !== undefined) out.href = l.href;
  if (l.hreflang !== undefined) out.hreflang = l.hreflang;
  return out;
}
