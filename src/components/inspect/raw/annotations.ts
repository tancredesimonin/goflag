import type { Page, RawLinkTag, RawMetaTag, RawScriptTag, TagOrigin } from "@/lib/core/types";

/**
 * Human-readable annotations for raw `<head>` tags. Surfaces what each tag
 * is *for* (which preview consumes it, what the rule layer cares about)
 * directly on hover in the Raw viewer — turns the inspector into a teaching
 * tool, not just a dumper.
 */
export interface RawTagAnnotation {
  /** Short label rendered in the tooltip header. */
  label: string;
  /** One-sentence description rendered below the label. */
  description: string;
  /** Optional list of "consumed by" facets (e.g. "Google SERP", "Slack"). */
  consumers?: string[];
}

export function annotateMeta(meta: RawMetaTag): RawTagAnnotation {
  if (meta.charset !== undefined) {
    return {
      label: "Character set",
      description: "Declares the document's text encoding. Should be utf-8 in practice.",
    };
  }
  const httpEquiv = meta.httpEquiv?.toLowerCase();
  if (httpEquiv === "content-type") {
    return {
      label: "Legacy content-type",
      description:
        "Pre-HTML5 way to declare encoding. Modern docs use <meta charset>; this still works as a fallback.",
    };
  }
  if (httpEquiv === "x-ua-compatible") {
    return {
      label: "Legacy IE rendering hint",
      description: "Tells old IE which rendering engine to use. Safe to remove on modern stacks.",
    };
  }
  if (httpEquiv === "refresh") {
    return {
      label: "Auto-refresh / redirect",
      description:
        "Forces the browser to navigate after N seconds. Generally an SEO smell — prefer 3xx redirects.",
    };
  }

  const property = meta.property?.toLowerCase();
  if (property?.startsWith("og:")) return annotateOg(property);

  const name = meta.name?.toLowerCase();
  if (name?.startsWith("twitter:")) return annotateTwitter(name);

  switch (name) {
    case "description":
      return {
        label: "Description",
        description:
          "The fallback text under your title in Google search results. Aim for 120–160 chars; truncated otherwise.",
        consumers: ["Google SERP"],
      };
    case "keywords":
      return {
        label: "Keywords (legacy)",
        description: "Ignored by Google since ~2009. Kept for completeness; safe to remove.",
      };
    case "viewport":
      return {
        label: "Viewport",
        description:
          "Required for mobile rendering. Standard value: width=device-width, initial-scale=1.",
      };
    case "robots":
      return {
        label: "Robots directives",
        description:
          "Crawler instructions for *all* search engines. e.g. noindex, nofollow, max-image-preview.",
        consumers: ["Google", "Bing"],
      };
    case "googlebot":
      return {
        label: "Google-only directives",
        description: "Same as robots, but only Googlebot honors it.",
        consumers: ["Google"],
      };
    case "theme-color":
      return {
        label: "Browser chrome color",
        description: "Tints the browser/PWA UI. Often paired with a dark-scheme media query.",
      };
    case "color-scheme":
      return {
        label: "Color scheme hint",
        description:
          "Tells the UA which schemes the page supports (e.g. 'dark light'). Affects scrollbars and form controls.",
      };
    case "author":
      return { label: "Author", description: "Free-text author name. Rarely used by crawlers." };
    case "generator":
      return {
        label: "Generator",
        description: "What tool produced this HTML. Purely informational.",
      };
    case "referrer":
      return {
        label: "Referrer policy",
        description: "Default Referer-header behavior for links from this page.",
      };
    case "application-name":
      return {
        label: "Application name",
        description: "Used by the browser when the user pins the page as a desktop app.",
      };
  }

  if (meta.name) {
    return {
      label: `meta name="${meta.name}"`,
      description: "Custom or framework-specific metadata. Goflag doesn't have a rule for it.",
    };
  }
  if (meta.property) {
    return {
      label: `meta property="${meta.property}"`,
      description:
        "Vendor-specific tag (commonly used by Facebook, LinkedIn, Pinterest). Captured verbatim.",
    };
  }
  return {
    label: "meta",
    description: "Bare meta tag with no name/property. Usually harmless.",
  };
}

function annotateOg(property: string): RawTagAnnotation {
  switch (property) {
    case "og:title":
      return {
        label: "OG title",
        description: "Title shown in social preview cards (Facebook, LinkedIn, X, Slack, Discord).",
        consumers: ["Facebook", "LinkedIn", "X", "Slack", "Discord", "iMessage"],
      };
    case "og:description":
      return {
        label: "OG description",
        description: "Subtitle shown under the OG title in social preview cards.",
        consumers: ["Facebook", "LinkedIn", "Slack", "Discord"],
      };
    case "og:image":
    case "og:image:url":
      return {
        label: "OG image",
        description:
          "The thumbnail social platforms render. Recommended: 1200×630, ≤8 MB, absolute https URL.",
        consumers: ["Facebook", "LinkedIn", "X", "Slack", "Discord"],
      };
    case "og:image:width":
      return {
        label: "OG image width",
        description: "Width in pixels — lets crawlers reserve layout space before downloading.",
      };
    case "og:image:height":
      return {
        label: "OG image height",
        description: "Height in pixels — lets crawlers reserve layout space before downloading.",
      };
    case "og:image:alt":
      return {
        label: "OG image alt text",
        description: "Describes the image for accessibility. Strongly recommended.",
      };
    case "og:image:type":
      return { label: "OG image MIME type", description: "Typically image/png or image/jpeg." };
    case "og:image:secure_url":
      return { label: "OG image (HTTPS)", description: "Explicit https URL for the image." };
    case "og:url":
      return {
        label: "OG canonical URL",
        description:
          "Treated as the canonical URL by social crawlers. Should match <link canonical>.",
      };
    case "og:type":
      return {
        label: "OG content type",
        description: "e.g. website, article, product. Affects the layout of LinkedIn / FB cards.",
      };
    case "og:site_name":
      return {
        label: "OG site name",
        description: "Shown above the title in Slack/Discord unfurls and LinkedIn cards.",
        consumers: ["Slack", "LinkedIn"],
      };
    case "og:locale":
      return {
        label: "OG locale",
        description: "Page locale, e.g. en_US, fr_FR. Used by Facebook to localise crawler text.",
      };
    case "og:locale:alternate":
      return {
        label: "OG alternate locale",
        description: "Other locales the same content is available in.",
      };
  }
  return {
    label: property,
    description: "Open Graph property captured verbatim. No specific rule attached.",
  };
}

function annotateTwitter(name: string): RawTagAnnotation {
  switch (name) {
    case "twitter:card":
      return {
        label: "X / Twitter card type",
        description:
          "summary, summary_large_image, app, or player. Determines the preview layout on X.",
        consumers: ["X / Twitter"],
      };
    case "twitter:title":
      return {
        label: "X / Twitter title",
        description: "Title for X preview cards. Falls back to og:title when missing.",
        consumers: ["X / Twitter"],
      };
    case "twitter:description":
      return {
        label: "X / Twitter description",
        description: "Description for X preview cards. Falls back to og:description.",
        consumers: ["X / Twitter"],
      };
    case "twitter:image":
    case "twitter:image:src":
      return {
        label: "X / Twitter image",
        description: "Preview image on X. Falls back to og:image when missing.",
        consumers: ["X / Twitter"],
      };
    case "twitter:image:alt":
      return {
        label: "X / Twitter image alt",
        description: "Alt text for the X preview image — accessibility + ranking signal.",
      };
    case "twitter:site":
      return { label: "X / Twitter site", description: "@handle of the publishing site." };
    case "twitter:creator":
      return {
        label: "X / Twitter creator",
        description: "@handle of the article's author.",
      };
  }
  return {
    label: name,
    description: "X / Twitter card property captured verbatim.",
  };
}

export function annotateLink(link: RawLinkTag): RawTagAnnotation {
  const rel = link.rel.toLowerCase();
  switch (rel) {
    case "canonical":
      return {
        label: "Canonical URL",
        description:
          "Tells search engines which URL is the source of truth when content is reachable from multiple paths.",
        consumers: ["Google", "Bing"],
      };
    case "alternate":
      if (link.hreflang) {
        return {
          label: `Alternate (hreflang=${link.hreflang})`,
          description:
            "Maps this URL to its translation in another locale. Use x-default for the language picker.",
          consumers: ["Google"],
        };
      }
      if (link.type) {
        return {
          label: `Alternate (${link.type})`,
          description: "Feed (RSS / Atom / JSON Feed) for this page.",
          consumers: ["RSS readers"],
        };
      }
      return { label: "Alternate", description: "Generic alternate link." };
    case "icon":
    case "shortcut icon":
      return {
        label: "Favicon",
        description: "Browser tab + bookmark icon. Multiple sizes are recommended.",
      };
    case "apple-touch-icon":
      return {
        label: "Apple touch icon",
        description:
          "Icon used when the page is added to the iOS/macOS home screen. 180×180 PNG is standard.",
      };
    case "manifest":
      return {
        label: "Web app manifest",
        description: "Pointer to the PWA manifest. Goflag fetches it as a side-channel probe.",
      };
    case "preconnect":
      return {
        label: "Preconnect",
        description: "Hint to open a TCP/TLS connection early. Performance-only; no SEO impact.",
      };
    case "dns-prefetch":
      return {
        label: "DNS prefetch",
        description: "Hint to resolve DNS early for the given host. Performance-only.",
      };
    case "stylesheet":
      return { label: "Stylesheet", description: "External CSS file." };
  }
  return {
    label: `link rel="${link.rel}"`,
    description: "Goflag doesn't yet have an annotation for this link relation.",
  };
}

export function annotateScript(script: RawScriptTag): RawTagAnnotation {
  if (script.type === "application/ld+json") {
    return {
      label: "JSON-LD structured data",
      description:
        "Schema.org-typed data Google uses for rich snippets (recipes, articles, breadcrumbs, etc.).",
      consumers: ["Google rich results"],
    };
  }
  return {
    label: script.type ? `script type="${script.type}"` : "script",
    description: "Script tag captured verbatim.",
  };
}

/**
 * Walks every raw `<head>` tag in `page` and produces a parallel array of
 * annotations + the rendered HTML snippet. The Raw viewer pairs each
 * annotation with its highlighted line.
 */
export interface AnnotatedRawTag {
  kind: "title" | "meta" | "link" | "script" | "html";
  /** Reconstructed HTML for display (always a single tag, never nested). */
  html: string;
  annotation: RawTagAnnotation;
  /**
   * Where this tag came from in `Page` terms — used by the Issues panel
   * (Phase 5) to anchor a "jump to tag" link to the right row.
   * `undefined` for synthetic rows (e.g. the `<html>` attribute summary,
   * which has no canonical TagOrigin shape).
   */
  origin?: TagOrigin;
}

function metaOrigin(m: RawMetaTag): TagOrigin {
  return { kind: "meta", name: m.name, property: m.property, httpEquiv: m.httpEquiv };
}

export function annotateRawHead(page: Page): AnnotatedRawTag[] {
  const out: AnnotatedRawTag[] = [];
  if (page.raw.htmlLang || page.raw.htmlDir) {
    const attrs: string[] = [];
    if (page.raw.htmlLang) attrs.push(`lang="${page.raw.htmlLang}"`);
    if (page.raw.htmlDir) attrs.push(`dir="${page.raw.htmlDir}"`);
    out.push({
      kind: "html",
      html: `<html ${attrs.join(" ")}>`,
      annotation: {
        label: "<html> attributes",
        description:
          "lang tells assistive tech and crawlers which language the document is in. dir handles RTL scripts.",
      },
      origin: { kind: "html", attribute: page.raw.htmlLang ? "lang" : "dir" },
    });
  }
  if (page.raw.title !== undefined) {
    out.push({
      kind: "title",
      html: `<title>${escapeHtml(page.raw.title)}</title>`,
      annotation: {
        label: "Document title",
        description:
          "First line of every Google SERP result and every preview card. Aim for 50–60 chars before truncation.",
        consumers: ["Google SERP", "Browser tab", "Facebook", "X", "Slack"],
      },
      origin: { kind: "title" },
    });
  }
  for (const m of page.raw.metas) {
    out.push({
      kind: "meta",
      html: serializeMeta(m),
      annotation: annotateMeta(m),
      origin: metaOrigin(m),
    });
  }
  for (const l of page.raw.links) {
    out.push({
      kind: "link",
      html: serializeLink(l),
      annotation: annotateLink(l),
      origin: { kind: "link", rel: l.rel },
    });
  }
  for (const s of page.raw.scripts) {
    out.push({
      kind: "script",
      html: serializeScript(s),
      annotation: annotateScript(s),
    });
  }
  return out;
}

function serializeMeta(m: { attributes: Record<string, string> }): string {
  return `<meta ${serializeAttrs(m.attributes)} />`;
}

function serializeLink(l: { attributes: Record<string, string> }): string {
  return `<link ${serializeAttrs(l.attributes)} />`;
}

function serializeScript(s: { attributes: Record<string, string>; content?: string }): string {
  const attrs = serializeAttrs(s.attributes);
  if (s.content) {
    const trimmed = s.content.length > 240 ? s.content.slice(0, 240) + "…" : s.content;
    return `<script ${attrs}>${escapeHtml(trimmed)}</script>`;
  }
  return `<script ${attrs}></script>`;
}

function serializeAttrs(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
    .join(" ");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
    }
    return ch;
  });
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
