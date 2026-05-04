import type { Page } from "@/lib/core/types";
import type { Suggestion } from "@/lib/structured/types";
import { renderJsonLd } from "../render";

export function organisationSuggestion(page: Page): Suggestion | undefined {
  const url = pickUrl(page);
  const name = page.openGraph.siteName?.value ?? page.meta.applicationName?.value ?? hostFrom(url);
  if (!url || !name) return undefined;

  const sameAs = (page.openGraph.unknown ?? [])
    .filter((p) => p.property === "og:see_also")
    .map((p) => p.value.value)
    .filter(Boolean);

  const payload = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name,
    url: ensureOriginUrl(url),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };

  return {
    id: "Organization",
    type: "Organization",
    title: "Add an Organization block to credit your brand",
    rationale:
      "Search engines use `Organization` to render the brand panel that appears next to your site in Knowledge Graph results. The minimum payload is `name` + `url`; add `logo` and `sameAs` (your social handles) to unlock the panel's image + social links.",
    severity: "info",
    example: {
      language: "json",
      snippet: renderJsonLd(payload),
    },
  };
}

function pickUrl(page: Page): string | undefined {
  return (
    page.links.canonical ??
    safe(page.openGraph.url?.value) ??
    page.fetch.finalUrl ??
    page.fetch.requestedUrl
  );
}

function safe(v: string | undefined): string | undefined {
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

function hostFrom(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

function ensureOriginUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/`;
  } catch {
    return url;
  }
}
