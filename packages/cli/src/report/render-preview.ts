/**
 * The share-card preview — one self-contained HTML document.
 *
 * `renderPreview` is a pure function of a `GoflagReport`, exactly like the
 * three terminal renderers beside it. It reads `report.extractions`, which is
 * the only section that carries what a page *declared* rather than what a rule
 * *decided*: a page can pass every `og.*` rule and still unfurl badly, and no
 * violations list can show that.
 *
 * Two things this file refuses to do, and they are the point.
 *
 * **It draws no geometry it cannot source.** Every surface carries the same
 * rigor scale the rule catalogue uses, because the surfaces are not equally
 * documented: Facebook, LinkedIn and WhatsApp publish real numbers; Slack calls
 * its own rendering a "micro-approximation"; Discord publishes nothing at all;
 * X's card documentation is not reachable, and its shape changed twice since
 * 2023. A preview that renders all seven identically states seven things with
 * one confidence, and six of them are not earned.
 *
 * **It escapes everything.** The input is a site under audit, which is to say
 * untrusted text, and the output is a file a human opens in a browser. Values
 * go through `esc`; URLs that are not `http(s)` never become an `src`.
 *
 * Opening the document asks for the image URLs the pages declared, which is
 * what makes it a preview rather than a table. Those URLs are the site's own
 * choice and need not point at the audited origin, so the document ships a CSP
 * that allows images and nothing else — no script, no frame, no fetch — and
 * every image is `referrerpolicy="no-referrer"`. Rendering itself never touches
 * the network.
 */

import { splitRoute } from "../lib/core/i18n";
import type { TagOrigin } from "../lib/core/types";
import type {
  Extraction,
  ExtractionAsset,
  ExtractionJsonLd,
  ExtractionOpenGraphImage,
  Fact,
} from "../lib/rules/extraction/types";
import type { GoflagReport, SeoIssue, SiteIssue } from "./types";

/**
 * What the rail pins. `SiteIssue` is the same shape minus `observed` /
 * `expected`, and some of its ids are head ids — see `findingsPanel`.
 */
type HeadFinding = SeoIssue | SiteIssue;

export interface RenderPreviewOptions {
  /** Document `<title>`. Defaults to the audited origin. */
  title?: string;
}

/** Rule id prefixes whose findings belong on a card rather than in a report. */
const HEAD_PREFIXES = ["og.", "twitter.", "icons.", "title.", "description.", "canonical."];

/**
 * `og.image.ratio`'s own bands, repeated here rather than imported: the rule
 * scores one number and this labels a picture, and the day the rule's bands
 * move is not automatically the day the caption should.
 */
const RATIO_IDEAL = [1.7, 2.1] as const;
const RATIO_ACCEPTABLE = [1, 3] as const;

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/**
 * Rule messages mark code spans with backticks — `render-terminal` strips them
 * because a terminal has nowhere to put them, and HTML does.
 *
 * Applied to catalogue text only, and after `esc`. Several rule messages
 * interpolate what the page said inside those backticks (`og.image.absolute`
 * quotes the URL it rejected), so this runs over escaped text on purpose: the
 * worst a site can do is put a `<code>` where it did not belong.
 */
function codeSpans(escaped: string): string {
  return escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
}

/** Cap a value echoed back into the document — a data: URI is unbounded. */
function clip(value: string, max = 300): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/**
 * Pretty-print a parsed JSON-LD block, or nothing.
 *
 * `JSON.stringify` is the first thing that walks this value: the extractor's
 * own type walker skips `@type`, so a page can carry a chain of them thousands
 * deep, parse cleanly, and blow the stack here. It also indents, which makes
 * the output quadratic in depth — 50 KB of hostile page measured 50 MB of HTML
 * before this cap existed. A site does not get to veto its own preview.
 */
function prettyJson(value: unknown): string | undefined {
  try {
    const out = JSON.stringify(value, null, 2);
    if (out === undefined) return undefined;
    return out.length > 20_000 ? `${out.slice(0, 20_000)}\n… truncated` : out;
  } catch {
    return undefined;
  }
}

/**
 * A URL fit to become an `src`, or nothing.
 *
 * A relative `og:image` is a finding (`og.image.absolute`), not something to
 * resolve silently — showing it as text is how the preview agrees with the rule
 * instead of hiding it.
 */
function safeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function hostOf(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}

function pathOf(value: string): string {
  try {
    const { pathname, search } = new URL(value);
    return `${pathname}${search}`;
  } catch {
    return value;
  }
}

/** Name the tag a value came from, in the words the page would have used. */
function originLabel(origin: TagOrigin): string {
  switch (origin.kind) {
    case "title":
      return "<title>";
    case "meta":
      if (origin.property) return origin.property;
      if (origin.name) return origin.name;
      if (origin.httpEquiv) return `http-equiv=${origin.httpEquiv}`;
      return "<meta>";
    case "link":
      return `<link rel="${origin.rel}">`;
    case "html":
      return `<html ${origin.attribute}>`;
    case "json-ld":
      return `JSON-LD #${origin.index}`;
    case "header":
      return `header: ${origin.name}`;
    case "computed":
      return "computed";
  }
}

/** One value with the tag it came from, so a fallback is visible as a fallback. */
interface Resolved {
  value: string;
  from: string;
}

function resolve(...facts: Array<Fact<string> | undefined>): Resolved | undefined {
  for (const fact of facts) {
    if (fact && fact.value.trim() !== "") {
      return { value: fact.value, from: originLabel(fact.origin) };
    }
  }
  return undefined;
}

interface CardImage {
  /** What the page said, verbatim. */
  declared: string;
  /** The same URL when it is safe to load; absent for anything else. */
  src?: string;
  alt?: string;
  from: string;
  /** How many `og:image` the page declared; consumers take the first. */
  count: number;
  declaredSize?: { width: number; height: number };
  probedSize?: { width: number; height: number };
  probe?: ExtractionAsset;
  ratio?: number;
}

interface Card {
  url: string;
  host: string;
  path: string;
  /** What each surface shows, already resolved through its own fallbacks. */
  ogTitle?: Resolved;
  ogDescription?: Resolved;
  documentTitle?: Resolved;
  metaDescription?: Resolved;
  siteName?: Resolved;
  xTitle?: Resolved;
  image?: CardImage;
  icon?: string;
  themeColor?: string;
  twitterCard?: string;
  locale?: string;
  alternates: string[];
  jsonLd: ExtractionJsonLd[];
  rendering: Extraction["rendering"];
  status: number;
}

/** A usable pair, or nothing: a CMS that means "unknown" writes 0, not absent. */
function usable(size: { width: number; height: number } | undefined) {
  return size && size.width > 0 && size.height > 0 ? size : undefined;
}

function imageOf(extraction: Extraction): CardImage | undefined {
  const og: ExtractionOpenGraphImage | undefined = extraction.openGraph.images[0];
  // `content=""` is kept verbatim by the extractor, so `??` would let an empty
  // `og:image` hide a perfectly good `twitter:image` behind it.
  const ogUrl = og?.url.value.trim() ? og.url.value : undefined;
  const declared = ogUrl ?? extraction.twitter.image?.value;
  if (!declared || declared.trim() === "") return undefined;

  // The probe map is keyed by the trimmed declared URL — `rules/index.ts` looks
  // it up the same way, and a preview that keyed it differently would report
  // "not probed" on an image the audit had just fetched.
  const probe = extraction.assets?.[declared.trim()];
  const declaredSize = usable(
    og?.width && og.height ? { width: og.width.value, height: og.height.value } : undefined,
  );
  const probedSize = usable(probe?.sizes?.[0]);
  const size = declaredSize ?? probedSize;

  return {
    declared,
    src: safeUrl(declared),
    alt: og?.alt?.value ?? extraction.twitter.imageAlt?.value,
    from: ogUrl ? "og:image" : "twitter:image",
    count: extraction.openGraph.images.length,
    declaredSize,
    probedSize,
    probe,
    // Nothing in the codebase computes this. `og.image.ratio` scores it and
    // keeps the number to itself — and rounds to two decimals before banding,
    // which is why this rounds too: a caption that bands 1.69731 as "cropped"
    // beside a rule that bands 1.70 as ideal makes the page argue with itself.
    ratio: size ? Math.round((size.width / size.height) * 100) / 100 : undefined,
  };
}

function cardOf(extraction: Extraction): Card {
  const { openGraph: og, twitter, meta, document: doc } = extraction;
  const url = extraction.http.finalUrl;
  return {
    url,
    host: hostOf(url),
    path: pathOf(url),
    ogTitle: resolve(og.title, doc.title),
    ogDescription: resolve(og.description, meta.description),
    documentTitle: resolve(doc.title),
    metaDescription: resolve(meta.description),
    siteName: resolve(og.siteName),
    xTitle: resolve(twitter.title, og.title, doc.title),
    image: imageOf(extraction),
    icon: safeUrl(extraction.links.icons[0]?.href),
    themeColor: meta.themeColor?.value,
    twitterCard: twitter.card?.value,
    locale: og.locale?.value ?? doc.lang?.value,
    alternates: og.localeAlternates.map((f) => f.value),
    jsonLd: extraction.jsonLd,
    rendering: extraction.rendering,
    status: extraction.http.status,
  };
}

// --- fragments ------------------------------------------------------------

function ratioNote(image: CardImage): string {
  if (image.ratio === undefined) return "no usable dimensions declared, and none decoded";
  const value = image.ratio.toFixed(2);
  const source = image.declaredSize ? "declared" : "decoded from the file";
  if (image.ratio >= RATIO_IDEAL[0] && image.ratio <= RATIO_IDEAL[1]) {
    return `${value}:1 ${source} — inside the 1.91:1 band every card is laid out for`;
  }
  if (image.ratio >= RATIO_ACCEPTABLE[0] && image.ratio <= RATIO_ACCEPTABLE[1]) {
    return `${value}:1 ${source} — renderable, but cropped away from 1.91:1`;
  }
  return `${value}:1 ${source} — outside anything a card renders whole`;
}

/** Plain text — both call sites escape it, so escaping here would double it. */
function probeNote(image: CardImage): string {
  if (!image.probe) return "not probed on this run";
  if (image.probe.ok) {
    const type = image.probe.contentType ? `, ${image.probe.contentType}` : "";
    return `answered ${image.probe.status}${type}`;
  }
  return image.probe.status === 0
    ? "the request failed — nothing answered"
    : `answered ${image.probe.status}, which is not an image`;
}

/** The image, or the honest reason there is nothing to draw. */
function imageBox(card: Card, className: string): string {
  const image = card.image;
  if (!image) {
    return `<div class="${className} shot empty"><span>no <code>og:image</code></span></div>`;
  }
  if (image.probe && !image.probe.ok) {
    return (
      `<div class="${className} shot broken">` +
      `<span>the image does not answer</span>` +
      `<em>${esc(probeNote(image))}</em>` +
      `</div>`
    );
  }
  if (!image.src) {
    return (
      `<div class="${className} shot empty">` +
      `<span>not an absolute http(s) URL</span>` +
      `<em>${esc(clip(image.declared))}</em>` +
      `</div>`
    );
  }
  const alt = image.alt ? esc(image.alt) : "";
  // `no-referrer` because opening this file asks the audited origin for the
  // image, and the local path of the analyst's preview is nobody's business.
  return `<div class="${className} shot"><img src="${esc(image.src)}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer"></div>`;
}

function frame(args: {
  name: string;
  rigor: "vendor-spec" | "guideline" | "heuristic" | "unsourced";
  body: string;
  note: string;
  source: string;
  trap?: { label: string; text: string };
}): string {
  const trap = args.trap
    ? `<p class="trap"><b>${esc(args.trap.label)}</b>${esc(args.trap.text)}</p>`
    : "";
  return `<article class="frame">
  <header><span class="name">${esc(args.name)}</span><span class="badge ${args.rigor.replace("-", "")}">${esc(args.rigor)}</span></header>
  <div class="stage">${args.body}</div>
  <footer><p>${args.note}</p>${trap}<span class="src">${esc(args.source)}</span></footer>
</article>`;
}

function favicon(card: Card): string {
  return card.icon
    ? `<img class="fav" src="${esc(card.icon)}" alt="" loading="lazy">`
    : `<span class="fav placeholder">${esc(card.host.slice(0, 1).toUpperCase())}</span>`;
}

// --- surfaces -------------------------------------------------------------

function googleSurface(card: Card): string {
  const title = card.documentTitle?.value ?? card.ogTitle?.value ?? card.url;
  const description = card.metaDescription?.value;
  const body = `<div class="serp">
  <div class="site">${favicon(card)}<span class="who"><b>${esc(card.siteName?.value ?? card.host)}</b><span>${esc(card.host)}${esc(card.path === "/" ? "" : ` › ${card.path.replace(/^\//, "").split("/").join(" › ")}`)}</span></span></div>
  <h4>${esc(title)}</h4>
  ${description ? `<p class="clamp2">${esc(description)}</p>` : `<p class="none">no <code>meta description</code> — the snippet is written from the page body</p>`}
</div>`;
  return frame({
    name: "Google — search result",
    rigor: "heuristic",
    body,
    note:
      "Not a card: no image, no ratio. <code>og:title</code> is one of the documented sources " +
      "for the title link; <code>og:description</code> is not documented as a snippet source " +
      "anywhere — the snippet comes from the page or from <code>meta description</code>.",
    source: "developers.google.com/search/docs/appearance/title-link · /snippet",
    trap: {
      label: "Not drawn here",
      text:
        "Google publishes no character or pixel limit — only truncation “to fit the device " +
        "width”. The two-line snippet above is the observed desktop shape, not a specification, " +
        "and the 600px / 155-character figures in circulation are third-party measurements that " +
        "disagree with each other.",
    },
  });
}

function openGraphSurface(card: Card): string {
  const image = card.image;
  const body = `<div class="ogwrap">
  ${imageBox(card, "og")}
  <dl class="facts">
    <dt>title</dt><dd>${card.ogTitle ? `${esc(card.ogTitle.value)} <span class="from">${esc(card.ogTitle.from)}</span>` : `<span class="none">absent</span>`}</dd>
    <dt>description</dt><dd>${card.ogDescription ? `${esc(card.ogDescription.value)} <span class="from">${esc(card.ogDescription.from)}</span>` : `<span class="none">absent</span>`}</dd>
    <dt>image</dt><dd>${image ? `<span class="mono">${esc(clip(image.declared))}</span> <span class="from">${esc(image.from)}${image.count > 1 ? ` · 1 of ${image.count}` : ""}</span>` : `<span class="none">absent</span>`}</dd>
    <dt>size</dt><dd>${image ? esc(ratioNote(image)) : `<span class="none">—</span>`}</dd>
    <dt>fetched</dt><dd>${image ? esc(probeNote(image)) : `<span class="none">—</span>`}</dd>
    <dt>alt</dt><dd>${image?.alt ? esc(image.alt) : `<span class="none">absent</span>`}</dd>
    <dt>locale</dt><dd>${card.locale ? esc(card.locale) : `<span class="none">absent</span>`}${card.alternates.length > 0 ? ` <span class="from">+ ${esc(card.alternates.join(", "))}</span>` : ""}</dd>
  </dl>
</div>`;
  return frame({
    name: "Open Graph — the source card",
    rigor: "vendor-spec",
    body,
    note:
      "The one fully specified surface: 1200×630 recommended, 600×315 floor, 200×200 absolute " +
      "minimum, 8MB, 1.91:1. Every surface below consumes this image, each in its own way.",
    source: "developers.facebook.com/docs/sharing/webmasters/images · ogp.me",
  });
}

function xSurface(card: Card): string {
  const title = card.xTitle?.value;
  const body = `<div class="xc">
  <div class="xshot">
    ${imageBox(card, "x")}
    <div class="overlay">${title ? `<span class="lab">${esc(title)}</span>` : ""}<span class="dom">${esc(card.host)}</span></div>
  </div>
</div>`;
  return frame({
    name: "X — link card",
    rigor: "unsourced",
    body,
    note:
      `Image, headline over the image, domain. Nothing else. This page declares ` +
      `<code>twitter:card</code> ${card.twitterCard ? `as <code>${esc(card.twitterCard)}</code>` : `nowhere, so X falls back to <code>og:*</code>`}.`,
    source: "X card documentation is not publicly reachable — dated behaviour, not a spec",
    trap: {
      label: "The old card is a lie",
      text:
        "X removed both headline and description on 4 October 2023. The headline came back in " +
        "January 2024 as small text over the image; the description never did. Headline-below-image " +
        "exists only for ads since May 2025. Any tool still drawing three stacked rows is drawing " +
        "a card that has not existed for years.",
    },
  });
}

function linkedInSurface(card: Card): string {
  const title = card.ogTitle?.value ?? card.url;
  const narrow = card.image?.declaredSize && card.image.declaredSize.width < 401;
  const body = `<div class="lic">
  ${imageBox(card, "li")}
  <div class="meta"><b>${esc(title)}</b><span>${esc(card.host)}</span></div>
</div>`;
  return frame({
    name: "LinkedIn — post unfurl",
    rigor: "vendor-spec",
    body,
    note:
      "Four tags required — <code>og:title</code>, <code>og:image</code>, " +
      "<code>og:description</code>, <code>og:url</code> — and a published geometry: 1200×627 " +
      "minimum, 1.91:1, 5MB. Under 401px wide the card falls back to a thumbnail, which is the " +
      "only documented layout switch of any surface here.",
    source: "linkedin.com/help/linkedin/answer/a521928",
    ...(narrow
      ? {
          trap: {
            label: "Thumbnail",
            text:
              `This image declares ${card.image?.declaredSize?.width}px wide, under LinkedIn's ` +
              `documented 401px cutoff — it renders as a small square, not as this card.`,
          },
        }
      : {}),
  });
}

function slackSurface(card: Card): string {
  const title = card.ogTitle?.value ?? card.url;
  const body = `<div class="slc">
  <span class="who">${favicon(card)}${esc(card.siteName?.value ?? card.host)}</span>
  <span class="t">${esc(title)}</span>
  ${card.ogDescription ? `<p>${esc(card.ogDescription.value)}</p>` : ""}
  ${imageBox(card, "sl")}
</div>`;
  return frame({
    name: "Slack — unfurl",
    rigor: "guideline",
    body,
    note:
      "Slack documents what it reads — Open Graph and X Card metadata — and calls the result " +
      "“some micro-approximation of the content”. No geometry, no image minimum, no character " +
      "limit is published. The one hard number: past five links in a message, nothing expands.",
    source: "docs.slack.dev/messaging/unfurling-links-in-messages",
  });
}

function discordSurface(card: Card): string {
  const title = card.ogTitle?.value ?? card.url;
  const accent = /^#[0-9a-f]{3,8}$/i.test(card.themeColor ?? "") ? card.themeColor : undefined;
  const body = `<div class="dcw"><div class="dcc"${accent ? ` style="border-left-color:${esc(accent)}"` : ""}>
  <span class="site">${esc(card.siteName?.value ?? card.host)}</span>
  <span class="t">${esc(title)}</span>
  ${card.ogDescription ? `<p>${esc(card.ogDescription.value)}</p>` : ""}
  ${imageBox(card, "dc")}
</div></div>`;
  return frame({
    name: "Discord — embed",
    rigor: "unsourced",
    body,
    note:
      "Discord publishes nothing about link unfurls: no tag table, no geometry. The accent bar " +
      `is drawn from ${accent ? `this page's <code>theme-color</code>` : "a default, since this page declares no <code>theme-color</code>"}, which is community-reported behaviour and not documented.`,
    source: "no Discord source exists for link previews",
    trap: {
      label: "Wrong numbers, right document",
      text:
        "Discord's documented 256 / 4096 / 6000 character limits are real, and they govern embeds " +
        "a bot sends through the API. Using them as unfurl truncation would be a sourcing error of " +
        "exactly the kind the rigor scale exists to prevent.",
    },
  });
}

function whatsAppSurface(card: Card): string {
  const title = card.ogTitle?.value ?? card.url;
  const body = `<div class="wac"><div class="wab"><div class="q">
  ${imageBox(card, "wa")}
  <div class="txt"><b class="clamp2">${esc(title)}</b>${card.ogDescription ? `<p class="clamp2">${esc(card.ogDescription.value)}</p>` : ""}<span>${esc(card.host)}</span></div>
</div><div class="msg">${esc(card.url)}</div></div></div>`;
  return frame({
    name: "WhatsApp — link preview",
    rigor: "vendor-spec",
    body,
    note:
      "The one messenger with a real spec from Meta: image under 600KB, at least 300px wide, " +
      "aspect ratio 4:1 or less, title in at most two lines, description in one or two — “80 " +
      "characters will suffice”. It is also the only surface where a 1200×630 card is more often " +
      "too heavy than too small.",
    source: "developers.facebook.com/documentation/business-messaging/whatsapp/link-previews",
  });
}

// --- panels ---------------------------------------------------------------

/**
 * Findings on the head, from both registries.
 *
 * `SiteIssue` carries the same shape and some of its ids wear a head prefix —
 * `icons.ico.missing` is site-scoped because a `/favicon.ico` belongs to an
 * origin, not to a page. Reading only `seoIssues` would print "nothing the
 * catalogue judges" on a page the catalogue had just judged.
 */
function findingsPanel(issues: HeadFinding[]): string {
  const head = issues.filter((i) => HEAD_PREFIXES.some((p) => i.ruleId.startsWith(p)));
  const others = issues.length - head.length;
  const rest =
    others > 0
      ? `<p class="foot">${others} other finding${others === 1 ? "" : "s"} on this page — they are in the report, not on a card.</p>`
      : "";
  if (head.length === 0) {
    return `<section class="panel"><h3>Findings on the head</h3><p class="none">Nothing the catalogue judges about this page's head. That is not the same as a card worth sharing — which is what the surfaces above are for.</p>${rest}</section>`;
  }
  const rows = head
    .map((issue) => {
      // `expected` is a `SeoIssue` field; a site-scoped finding has none, and
      // the catalogue drops the field for `SITE_RULES` anyway.
      const expected = "expected" in issue ? issue.expected : undefined;
      return `<li class="find ${esc(issue.severity)}">
  <span class="rid">${esc(issue.ruleId)}</span>
  <span class="msg">${codeSpans(esc(issue.message))}</span>
  <span class="pin">${esc(issue.severity)}${issue.rigor ? ` · ${esc(issue.rigor)}` : ""}${expected ? ` · expected ${codeSpans(esc(expected))}` : ""}</span>
</li>`;
    })
    .join("\n");
  return `<section class="panel"><h3>Findings on the head</h3><ul class="finds">${rows}</ul>${rest}</section>`;
}

function jsonLdPanel(blocks: ExtractionJsonLd[]): string {
  const note =
    `<p class="foot">Shown, never judged: no rule in the catalogue reads <code>jsonLd</code>, ` +
    `and that refusal is deliberate — nothing says which schema a page <em>should</em> carry.</p>`;
  if (blocks.length === 0) {
    return `<section class="panel"><h3>JSON-LD <span class="badge unjudged">extracted, unjudged</span></h3><p class="none">No <code>application/ld+json</code> block on this page — and no rule can hold that against it.</p>${note}</section>`;
  }
  const chips = blocks
    .map((block) => {
      const label = block.parseError
        ? `#${block.index} ${block.parseError}`
        : `#${block.index} ${block.types.join(", ") || "no @type"}`;
      return `<span class="chip${block.parseError ? " bad" : ""}">${esc(label)}</span>`;
    })
    .join("");
  const first = blocks.find((block) => block.data !== null);
  const pretty = first ? prettyJson(first.data) : undefined;
  const body =
    pretty === undefined
      ? `<pre>${esc(blocks[0]?.raw.slice(0, 2000) ?? "")}</pre>`
      : `<pre>${esc(pretty)}</pre>`;
  return `<section class="panel"><h3>JSON-LD <span class="badge unjudged">extracted, unjudged</span></h3><div class="chips">${chips}</div>${body}${note}</section>`;
}

function renderingNote(card: Card): string {
  if (card.rendering.mode === "static") {
    return `read from the static HTML — what a crawler that runs no JavaScript sees`;
  }
  return card.rendering.escalated
    ? `read from the hydrated DOM, after the static head looked empty${card.rendering.escalationReason ? ` (${card.rendering.escalationReason})` : ""} — a crawler that runs no JavaScript sees less than this`
    : `read from the hydrated DOM — a crawler that runs no JavaScript may see less than this`;
}

/**
 * Count what a reader counts, not what UTF-16 does.
 *
 * The number matters because it is what a card's own size ladder reads: a
 * German title that gains 30% over its English source drops a step, and the
 * step is chosen on graphemes. The ladder itself is the site's — `@goflag/og`
 * refuses to ship default steps — so this reports the length and never the
 * step it would land on.
 */
function graphemes(value: string): number {
  if (typeof Intl?.Segmenter === "function") {
    return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)].length;
  }
  return [...value].length;
}

/** One row of the translation strip. */
interface Sibling {
  index: number;
  locale: string;
  path: string;
  ogLocale?: string;
  title: string;
  description: string;
}

/**
 * The same route in its other languages.
 *
 * Nobody else previews this axis, and goflag is the tool that already knows
 * it. What it shows is the text, not eight more pictures: the card is drawn
 * from the words, so the words side by side are what a divergence looks like
 * — a translation that outgrows its ladder, one locale still carrying the
 * source language, a description that only got written once.
 */
function translationsPanel(current: Sibling, siblings: Sibling[]): string {
  if (siblings.length < 2) return "";
  const rows = siblings
    .map((s) => {
      const here = s.index === current.index;
      return `<tr${here ? ' class="here"' : ""}>
  <td class="loc">${here ? "▸ " : ""}${esc(s.locale)}</td>
  <td class="og">${s.ogLocale ? esc(s.ogLocale) : `<span class="none">no og:locale</span>`}</td>
  <td>${here ? esc(s.title) : `<a href="#page-${s.index}">${esc(s.title)}</a>`}</td>
  <td class="num">${graphemes(s.title)}</td>
  <td class="num">${s.description ? graphemes(s.description) : `<span class="none">—</span>`}</td>
</tr>`;
    })
    .join("\n");
  return `<section class="panel"><h3>This route in ${siblings.length} languages</h3>
<div class="tw"><table class="locs">
<thead><tr><th>path</th><th>og:locale</th><th>og:title</th><th class="num">gr.</th><th class="num">desc.</th></tr></thead>
<tbody>${rows}</tbody>
</table></div>
<p class="foot">Lengths are graphemes, which is what a card's size ladder counts. The ladder is the site's own — <code>@goflag/og</code> ships none — so this reports the length and not the step.</p></section>`;
}

// --- the route tree -------------------------------------------------------

/**
 * One node of the route tree — a path segment, and what hangs off it.
 *
 * `segments` is a list rather than a string because a chain with nothing to
 * choose between its links is one row: a `/stet` that holds only `/1.6.3`
 * reads as `/stet/1.6.3`, and keeping them apart costs a level of indentation
 * and buys no decision.
 */
interface RouteNode {
  segments: string[];
  /** The page that lives exactly here, when the crawl read one. */
  index?: number;
  /** Insertion-ordered on purpose — see `buildRouteTree`. */
  children: Map<string, RouteNode>;
  /** Pages in this subtree, this node's own page included. */
  count: number;
}

/**
 * Split a path into the segments the tree branches on.
 *
 * A query string rides on the last segment rather than becoming one: `?` is not
 * a path separator, and two pages that differ only by their query must still
 * land on two different rows.
 */
function pathSegments(path: string): string[] {
  const cut = path.indexOf("?");
  const pathname = cut === -1 ? path : path.slice(0, cut);
  const search = cut === -1 ? "" : path.slice(cut);
  const segments = pathname.split("/").filter(Boolean);
  if (search === "") return segments;
  return segments.length === 0
    ? [search]
    : [...segments.slice(0, -1), `${segments.at(-1)}${search}`];
}

/**
 * The crawled paths as a tree, single-child chains already folded away.
 *
 * Insertion order is kept rather than sorted: the rows carry `#page-N` anchors
 * into the sections below, and those sections are in crawl order. A tree that
 * sorted its own rows would read in one order and link into another.
 */
function buildRouteTree(paths: string[]): RouteNode {
  const root: RouteNode = { segments: [], children: new Map(), count: 0 };
  paths.forEach((path, index) => {
    let node = root;
    node.count++;
    for (const segment of pathSegments(path)) {
      const child: RouteNode = node.children.get(segment) ?? {
        segments: [segment],
        children: new Map(),
        count: 0,
      };
      node.children.set(segment, child);
      child.count++;
      node = child;
    }
    // Two extractions on one path — a redirect that landed twice — keep the
    // first: the second has a section of its own, reachable from nothing here,
    // and that is better than a row that silently means one of two pages.
    node.index ??= index;
  });
  return { ...root, children: foldChildren(root.children) };
}

/** Fold every chain that offers no choice, recursively. */
function foldChildren(children: Map<string, RouteNode>): Map<string, RouteNode> {
  return new Map([...children].map(([key, node]) => [key, foldChain(node)]));
}

function foldChain(node: RouteNode): RouteNode {
  let current = node;
  // A node that is itself a page keeps its own row — folding it away would
  // fold away the only link to it.
  while (current.index === undefined && current.children.size === 1) {
    const only = [...current.children.values()][0]!;
    current = { ...only, segments: [...current.segments, ...only.segments] };
  }
  return { ...current, children: foldChildren(current.children) };
}

/**
 * The tree, as nested `<details>`.
 *
 * Folding is the whole point at 300 pages, and this document ships a CSP that
 * allows images and nothing else — there is no script here to fold anything.
 * `<details>` is the one disclosure the browser implements on its own, which is
 * why the tree is built out of it rather than out of a control that would need
 * one line of JavaScript and cost the policy above.
 *
 * A folder's label toggles it; the `↗` beside it opens the page at that exact
 * path, because most folders here are pages too — `/fr/blog` is a route and a
 * parent at once. The link takes the click (it is the innermost activatable
 * element, so the disclosure never sees it) and the two actions stay separate.
 */
function routeList(node: RouteNode, open: boolean, className = ""): string {
  const items = [...node.children.values()].map((child) => {
    const label = esc(child.segments.map((segment) => `/${segment}`).join(""));
    if (child.children.size === 0) {
      return child.index === undefined
        ? `<li class="leaf"><span>${label}</span></li>`
        : `<li class="leaf"><a href="#page-${child.index}">${label}</a></li>`;
    }
    // A folder the crawl never read as a page of its own — `/endpoints` under a
    // docs tree — still holds the slot open, or the counts down the column stop
    // lining up wherever one is missing.
    const self =
      child.index === undefined
        ? `<span class="go"></span>`
        : `<a class="go" href="#page-${child.index}" title="the page at this path">↗</a>`;
    return `<li><details${open ? " open" : ""}><summary><span class="seg">${label}</span><span class="n">${child.count}</span>${self}</summary>
${routeList(child, open)}</details></li>`;
  });
  return `<ul${className ? ` class="${className}"` : ""}>${items.join("\n")}</ul>`;
}

/**
 * Pages small enough to read at once are shown at once.
 *
 * A dozen routes folded into four collapsed rows is worse than the flat list
 * this replaced; three hundred is the case that needed a tree at all.
 */
const TREE_OPEN_MAX = 20;

/** One `<meta>` or `<link>`, printed the way the page wrote it. */
function tagLabel(tag: {
  name?: string;
  property?: string;
  httpEquiv?: string;
  rel?: string;
  href?: string;
  content?: string;
}): string {
  const key =
    tag.property ?? tag.name ?? (tag.httpEquiv ? `http-equiv=${tag.httpEquiv}` : undefined);
  if (key) return `${key}${tag.content ? ` = ${clip(tag.content, 120)}` : ""}`;
  return `rel=${tag.rel ?? "?"}${tag.href ? ` → ${clip(tag.href, 120)}` : ""}`;
}

/**
 * What the browser shows and the unfurl never will.
 *
 * Only the escalation path produces this, so absence is silence rather than a
 * clean bill — the panel says which of the two it is instead of drawing an
 * empty box that reads like a pass.
 */
function hydrationPanel(extraction: Extraction): string {
  const delta = extraction.hydration;
  if (!delta) {
    const why =
      extraction.rendering.mode === "static"
        ? "this run never rendered the page, so there is no second reading to compare against"
        : "this run rendered the page without keeping a static reading to compare against";
    return `<section class="panel"><h3>Static vs hydrated</h3><p class="none">Not established — ${why}.</p></section>`;
  }

  const lines = [
    ...delta.injectedMetas.map((m) => ({ sign: "+", text: tagLabel(m) })),
    ...delta.injectedLinks.map((l) => ({ sign: "+", text: tagLabel(l) })),
    ...delta.removedMetas.map((m) => ({ sign: "−", text: tagLabel(m) })),
    ...delta.removedLinks.map((l) => ({ sign: "−", text: tagLabel(l) })),
    ...(delta.titleChanged ? [{ sign: "+", text: "<title> — rewritten after hydration" }] : []),
    ...(delta.htmlLangChanged
      ? [{ sign: "+", text: "<html lang> — changed after hydration" }]
      : []),
    ...(delta.jsonLdBlocksAdded > 0
      ? [{ sign: "+", text: `${delta.jsonLdBlocksAdded} JSON-LD block(s) added by script` }]
      : []),
  ];

  if (lines.length === 0) {
    return `<section class="panel"><h3>Static vs hydrated</h3><p class="none">Both readings agree: every tag above is in the HTML before any script runs.</p></section>`;
  }

  const rows = lines
    .map(
      (l) =>
        `<li class="${l.sign === "+" ? "added" : "removed"}"><span class="sign">${l.sign}</span>${esc(l.text)}</li>`,
    )
    .join("\n");
  return `<section class="panel"><h3>Static vs hydrated <span class="badge unjudged">no rule reads this</span></h3>
<ul class="delta">${rows}</ul>
<p class="foot">A <code>+</code> is a tag only the browser has. Unfurlers run no JavaScript, so the cards above are drawn from something a crawler may never receive — and every <code>og.*</code> rule judges the declaration it was handed, not which pass handed it over.</p></section>`;
}

function pageSection(
  extraction: Extraction,
  issues: HeadFinding[],
  index: number,
  siblings: Sibling[],
): string {
  const card = cardOf(extraction);
  const surfaces = [
    openGraphSurface(card),
    googleSurface(card),
    xSurface(card),
    linkedInSurface(card),
    slackSurface(card),
    discordSurface(card),
    whatsAppSurface(card),
  ].join("\n");
  return `<section class="page" id="page-${index}">
  <header class="pagehead">
    <h2>${esc(card.path)}</h2>
    <p class="url">${esc(card.url)}</p>
    <p class="meta">${card.status} · ${esc(renderingNote(card))}${card.locale ? ` · ${esc(card.locale)}` : ""}</p>
  </header>
  <div class="surfaces">${surfaces}</div>
  ${findingsPanel(issues)}
  ${translationsPanel(
    siblings.find((sib) => sib.index === index)!,
    siblings,
  )}
  ${hydrationPanel(extraction)}
  ${jsonLdPanel(card.jsonLd)}
</section>`;
}

// --- document -------------------------------------------------------------

const STYLE = `
:root{--paper:#fff;--paper2:#f7f8f7;--ink:#09090b;--ink2:#4c534f;--ink3:#6d7671;--line:#e5e6e5;--line2:#d3d6d4;--brand:#009966;--green:#007a55;--amber:#bb4d00;--red:#e7000b;--wash:#f2f6f4;
--g-title:#1a0dab;--g-text:#4d5156;--x-bg:#000;--x-fg:#e7e9ea;--x-line:#2f3336;--li-strip:#f3f2ef;--sl-link:#1264a3;--sl-rail:#ddd;--dc-bg:#313338;--dc-embed:#2b2d31;--dc-fg:#dbdee1;--dc-dim:#b5bac1;--dc-link:#00a8fc;--wa-bg:#efeae2;--wa-bubble:#d9fdd3;--wa-quote:#d1f4cb;--wa-fg:#111b21;--wa-dim:#667781;
--mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;--ui:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
@media (prefers-color-scheme:dark){:root{--paper:#0a0a0c;--paper2:#121316;--ink:#fafafa;--ink2:#b6bcb9;--ink3:#878e8a;--line:#23252a;--line2:#32353b;--brand:#00d492;--green:#00d492;--amber:#ffb900;--red:#ff6467;--wash:#101614}}
*{box-sizing:border-box}
body{margin:0;padding:0 20px 100px;background:var(--paper);color:var(--ink);font:15px/1.6 var(--ui);-webkit-font-smoothing:antialiased}
.wrap{max-width:1120px;margin-inline:auto}
h1,h2,h3,.badge,.chip,.rid,.src,.from,.mono,code,pre,dt,.pin,.nav{font-family:var(--mono)}
h1{font-size:22px;letter-spacing:-.02em;margin:0 0 6px}
.lede{color:var(--ink2);margin:0;max-width:70ch}
header.doc{padding:44px 0 24px;border-bottom:1px solid var(--line)}
.nav{margin:22px 0 0;max-width:620px}
.navnote{margin:0 0 8px;font-family:var(--ui);font-size:12px;color:var(--ink3)}
.tree,.tree ul{list-style:none;margin:0;padding:0;font-size:12px}
.tree ul{margin-left:6px;padding-left:12px;border-left:1px solid var(--line)}
.tree summary{display:flex;align-items:center;gap:10px;padding:3px 7px;border-radius:3px;color:var(--ink2);cursor:pointer;list-style:none}
.tree summary::-webkit-details-marker{display:none}
.tree summary::before{content:"▸";flex:none;width:1ch;font-size:9px;color:var(--ink3)}
.tree details[open]>summary::before{content:"▾"}
.tree summary:hover,.tree summary:focus-visible{background:var(--wash);color:var(--ink)}
.tree .seg{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tree .n{margin-left:auto;flex:none;font-size:10px;color:var(--ink3);font-variant-numeric:tabular-nums}
.tree .go{flex:none;width:1.2em;text-align:right;font-size:11px;text-decoration:none;opacity:.55}
.tree .go:hover,.tree .go:focus-visible{opacity:1}
.tree .leaf a,.tree .leaf span{display:block;padding:3px 7px 3px 24px;color:var(--ink2);text-decoration:none;border-radius:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tree .leaf a:hover,.tree .leaf a:focus-visible{background:var(--wash);color:var(--brand)}
.page{padding-top:52px}
.pagehead h2{font-size:16px;margin:0 0 4px}
.pagehead .url{margin:0;font-size:13px;color:var(--ink2);word-break:break-all}
.pagehead .meta{margin:6px 0 0;font-size:12px;color:var(--ink3);font-family:var(--mono)}
.surfaces{display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:22px;margin-top:22px}
.frame{border:1px solid var(--line);border-radius:8px;background:var(--paper2);display:flex;flex-direction:column;overflow:hidden}
.frame>header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 13px;border-bottom:1px solid var(--line);background:var(--paper)}
.frame>header .name{font-size:12px;font-weight:600}
.frame .stage{padding:16px;display:flex;justify-content:center}
.frame footer{margin-top:auto;border-top:1px solid var(--line);padding:11px 13px;font-size:12.5px;line-height:1.5;color:var(--ink2)}
.frame footer p{margin:0 0 6px}
.src{display:block;font-size:10.5px;color:var(--ink3);word-break:break-all}
.badge{font-size:10px;letter-spacing:.06em;text-transform:uppercase;padding:3px 7px;border-radius:3px;border:1px solid var(--line2);color:var(--ink3);white-space:nowrap}
.badge.vendorspec{color:var(--green);border-color:currentColor}
.badge.guideline,.badge.heuristic{color:var(--amber);border-color:currentColor}
.badge.unsourced{color:var(--red);border-color:currentColor}
.badge.unjudged{color:var(--ink3);text-transform:none;letter-spacing:0}
.trap{margin:8px 0 0;padding-left:10px;border-left:2px solid var(--red);font-size:12px}
.trap b{display:block;font-family:var(--mono);font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--red)}
.shot{width:100%;overflow:hidden;background:#0d0e10}
.shot img{display:block;width:100%;height:auto}
.shot.empty,.shot.broken{aspect-ratio:1.91/1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:var(--wash);color:var(--ink3);font-size:12.5px;text-align:center;padding:12px;border:1px dashed var(--line2)}
.shot.broken{border-color:var(--red);color:var(--red)}
.shot em{font-family:var(--mono);font-size:11px;font-style:normal;opacity:.85;word-break:break-all}
.ogwrap{width:100%;display:flex;flex-direction:column;gap:14px}
.facts{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;margin:0;font-size:12.5px}
.facts dt{color:var(--ink3);font-size:11px}
.facts dd{margin:0;word-break:break-word}
.from{font-family:var(--mono);font-size:10.5px;color:var(--brand)}
.none{color:var(--ink3);font-style:italic}
.mono{font-family:var(--mono);font-size:11.5px;word-break:break-all}
.clamp2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.serp{width:100%;max-width:600px;font-family:Arial,var(--ui)}
.serp .site{display:flex;align-items:center;gap:10px;margin-bottom:4px}
.fav{width:26px;height:26px;border-radius:50%;flex:none;object-fit:contain;background:var(--wash)}
.fav.placeholder{display:grid;place-items:center;font-family:var(--mono);font-size:12px;color:var(--ink2)}
.serp .who b{display:block;font-size:14px;font-weight:400}
.serp .who span{font-size:12px;color:var(--ink3)}
.serp h4{font-size:19px;line-height:1.3;font-weight:400;color:var(--g-title);margin:4px 0 3px}
.serp p{font-size:13.5px;line-height:1.56;margin:0;color:var(--g-text)}
@media (prefers-color-scheme:dark){.serp h4{color:#8ab4f8}.serp p{color:var(--ink2)}}
.xc{width:100%;max-width:440px}
.xshot{position:relative;border:1px solid var(--x-line);border-radius:14px;overflow:hidden;background:var(--x-bg)}
.overlay{position:absolute;left:10px;right:10px;bottom:10px;display:flex;flex-direction:column;align-items:flex-start;gap:4px}
.overlay .lab{background:#000000bf;color:var(--x-fg);font-size:12px;line-height:1.25;padding:3px 7px;border-radius:4px;max-width:100%}
.overlay .dom{font-size:11px;color:#fffc;text-shadow:0 1px 2px #000}
.lic{width:100%;max-width:440px;border:1px solid var(--line2);border-radius:2px;overflow:hidden}
.lic .meta{padding:10px 12px;background:var(--li-strip);color:#000}
.lic .meta b{display:block;font-size:14px;line-height:1.35}
.lic .meta span{font-size:12px;color:#00000099}
.slc{width:100%;max-width:440px;padding:2px 0 2px 12px;border-left:4px solid var(--sl-rail)}
.slc .who{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;margin-bottom:3px}
.slc .who .fav{width:16px;height:16px;border-radius:3px}
.slc .t{display:block;font-size:14px;font-weight:700;color:var(--sl-link);margin-bottom:3px}
.slc p{font-size:13px;line-height:1.45;margin:0 0 8px}
.slc .shot{max-width:360px;border-radius:8px}
.dcw{width:100%;max-width:440px;background:var(--dc-bg);padding:11px;border-radius:8px}
.dcc{background:var(--dc-embed);border-left:4px solid var(--brand);border-radius:4px;padding:11px 13px 13px}
.dcc .site{font-size:11.5px;color:var(--dc-fg)}
.dcc .t{display:block;font-size:15px;font-weight:600;color:var(--dc-link);line-height:1.3;margin:5px 0}
.dcc p{font-size:13px;line-height:1.42;color:var(--dc-dim);margin:0 0 9px}
.dcc .shot{border-radius:4px}
.wac{width:100%;max-width:330px;background:var(--wa-bg);padding:12px;border-radius:8px}
.wab{background:var(--wa-bubble);border-radius:8px;padding:4px}
.wab .q{background:var(--wa-quote);border-radius:6px;overflow:hidden}
.wab .txt{padding:8px 10px;color:var(--wa-fg)}
.wab .txt b{display:block;font-size:12.5px;line-height:1.3}
.wab .txt p{font-size:12px;color:var(--wa-dim);margin:2px 0 0;line-height:1.35}
.wab .txt span{font-size:11px;color:var(--wa-dim)}
.wab .msg{padding:5px 9px 3px;font-size:13px;color:var(--wa-fg);word-break:break-all}
.panel{margin-top:22px;border:1px solid var(--line);border-radius:8px;padding:16px 18px;background:var(--paper2)}
.panel h3{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink3);margin:0 0 12px;display:flex;align-items:center;gap:10px}
.panel .foot{margin:12px 0 0;font-size:12.5px;color:var(--ink3)}
.finds{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.find{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;padding:9px 0 9px 12px;border-left:3px solid var(--ink3);border-bottom:1px solid var(--line)}
.find:last-child{border-bottom:0}
.find.error{border-left-color:var(--red)}
.find.warning{border-left-color:var(--amber)}
.find .rid{font-size:12.5px;font-weight:600}
.find .msg{font-size:13.5px;color:var(--ink2)}
.find .pin{grid-column:1/-1;font-size:11px;color:var(--ink3)}
.tw{overflow-x:auto}
table.locs{border-collapse:collapse;width:100%;font-size:13px}
table.locs th{text-align:left;font-family:var(--mono);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink3);font-weight:600;padding:0 12px 7px 0;border-bottom:1px solid var(--line)}
table.locs td{padding:7px 12px 7px 0;border-bottom:1px solid var(--line);vertical-align:top}
table.locs tr:last-child td{border-bottom:0}
table.locs .loc,table.locs .og{font-family:var(--mono);font-size:12px;white-space:nowrap}
table.locs .num{font-family:var(--mono);text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
table.locs tr.here td{color:var(--ink);font-weight:600}
table.locs tr.here .loc{color:var(--brand)}
.delta{list-style:none;margin:0;padding:0;font-family:var(--mono);font-size:12.5px;line-height:1.7}
.delta li{display:flex;gap:9px;word-break:break-word}
.delta .sign{flex:none;width:1ch;font-weight:700}
.delta .added .sign,.delta li.added{color:var(--green)}
.delta .removed .sign,.delta li.removed{color:var(--red)}
.chips{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px}
.chip{font-size:11px;padding:3px 8px;border:1px solid var(--line2);border-radius:3px;color:var(--ink2)}
.chip.bad{color:var(--red);border-color:currentColor}
pre{margin:0;padding:13px 15px;background:#121416;color:#d8dbde;border-radius:6px;font-size:11.5px;line-height:1.55;overflow-x:auto}
code{font-size:.9em;background:var(--wash);border:1px solid var(--line);border-radius:3px;padding:.05em .3em}
footer.doc{margin-top:70px;padding-top:20px;border-top:1px solid var(--line);font-family:var(--mono);font-size:11.5px;color:var(--ink3)}
a{color:var(--brand)}
:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
`;

/**
 * Render the whole preview.
 *
 * A report without `extractions` renders a document that says so rather than an
 * empty one: the caller asked for a preview and got a report that cannot make
 * one, and that is a fact about the run, not an error to swallow.
 */
export function renderPreview(report: GoflagReport, options: RenderPreviewOptions = {}): string {
  const title = options.title ?? `goflag preview — ${hostOf(report.url)}`;
  const extractions = report.extractions ?? [];
  const issuesByPage = new Map<string, HeadFinding[]>();
  for (const issue of [...report.seoIssues, ...report.siteIssues]) {
    const bucket = issuesByPage.get(issue.pageUrl);
    if (bucket) bucket.push(issue);
    else issuesByPage.set(issue.pageUrl, [issue]);
  }

  // Two different facts, and they read differently: a report that was never
  // asked for extractions, and a crawl that reached no page worth extracting.
  const empty =
    report.extractions === undefined
      ? `This report carries no extractions, so there is nothing to draw. Pass <code>extractions: true</code> to <code>runAudit</code>, or use <code>goflag preview &lt;url&gt;</code>, which does.`
      : `The crawl reached no HTML page it could read, so there is nothing to draw. Every page was unreachable, not HTML, or a declared duplicate of another.`;

  // Group by locale-free route, on the same derivation the cross-page rules
  // use — comparing two artefacts is only meaningful if both are normalised
  // identically, and this compares a page with its own translations.
  const rows: Sibling[] = extractions.map((extraction, index) => {
    const path = pathOf(extraction.http.finalUrl);
    return {
      index,
      locale: splitRoute(path).locale,
      path,
      ogLocale: extraction.openGraph.locale?.value,
      title: cardOf(extraction).ogTitle?.value ?? path,
      description: cardOf(extraction).ogDescription?.value ?? "",
    };
  });
  const byRoute = new Map<string, Sibling[]>();
  extractions.forEach((extraction, index) => {
    const route = splitRoute(pathOf(extraction.http.finalUrl)).route;
    byRoute.set(route, [...(byRoute.get(route) ?? []), rows[index]!]);
  });

  const body =
    extractions.length === 0
      ? `<section class="page"><p class="none">${empty}</p></section>`
      : extractions
          .map((extraction, index) =>
            pageSection(
              extraction,
              issuesByPage.get(extraction.http.finalUrl) ?? [],
              index,
              byRoute.get(splitRoute(pathOf(extraction.http.finalUrl)).route) ?? [],
            ),
          )
          .join("\n");

  const nav =
    extractions.length > 1
      ? `<nav class="nav">
  <p class="navnote">${extractions.length} pages, by path. A folder folds; the ↗ beside one opens the page at that path itself.</p>
  ${routeList(
    buildRouteTree(extractions.map((extraction) => pathOf(extraction.http.finalUrl))),
    extractions.length <= TREE_OPEN_MAX,
    "tree",
  )}
</nav>`
      : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src http: https: data:; style-src 'unsafe-inline'">
<title>${esc(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
<header class="doc">
  <h1>${esc(title)}</h1>
  <p class="lede">What each surface makes of ${esc(report.url)}, drawn from what the pages declared. Each surface carries the rigor of the geometry it is drawn from — three of the seven publish one, two publish nothing at all, and Google is not a card.</p>
  ${nav}
</header>
${body}
<footer class="doc">${esc(`${extractions.length} page${extractions.length === 1 ? "" : "s"} · audited ${report.finishedAt} · profile ${report.profile} · goflag`)}</footer>
</div>
</body>
</html>
`;
}
