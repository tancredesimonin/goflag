import type { Page } from "../core/types";

/**
 * Render a `Page` as a human-readable summary suitable for `headlint inspect`
 * without `--json`. Deliberately compact and ASCII-only so it copies cleanly
 * into terminals, GitHub issues, and Slack.
 */
export function renderPageSummary(page: Page): string {
  const lines: string[] = [];
  const { fetch, extractor, hydration, meta, openGraph, twitter, links, jsonLd, probes } = page;

  lines.push(`Headlint inspect`);
  lines.push(`  URL              ${fetch.requestedUrl}`);
  if (fetch.finalUrl !== fetch.requestedUrl) {
    lines.push(`  Final URL        ${fetch.finalUrl} (after ${fetch.redirectCount} redirect(s))`);
  }
  lines.push(
    `  Status           ${fetch.status} ${fetch.statusText} ` +
      `(${fetch.durationMs}ms, ${formatBytes(fetch.bodyBytes)})`,
  );
  if (fetch.contentType) lines.push(`  Content-Type     ${fetch.contentType}`);
  const extractorLine =
    extractor.mode === "headless"
      ? extractor.escalated
        ? `headless (escalated: ${extractor.escalationReason ?? "client-rendered"})`
        : "headless (forced)"
      : extractor.escalationReason
        ? `static (${extractor.escalationReason})`
        : "static";
  lines.push(`  Extractor        ${extractorLine}`);
  if (hydration) {
    const injected = hydration.clientInjectedMetas.length + hydration.clientInjectedLinks.length;
    const removed = hydration.clientRemovedMetas.length + hydration.clientRemovedLinks.length;
    lines.push(
      `  Hydration        +${injected} / -${removed} tags` +
        (hydration.titleChanged ? ", title changed" : "") +
        (hydration.jsonLdBlocksAdded > 0
          ? `, +${hydration.jsonLdBlocksAdded} JSON-LD block(s)`
          : ""),
    );
  }

  lines.push("");
  lines.push("Meta");
  lines.push(`  title            ${quote(meta.title?.value)}`);
  lines.push(`  description      ${quote(meta.description?.value)}`);
  lines.push(`  canonical        ${quote(meta.canonical?.value)}`);
  lines.push(`  charset          ${quote(meta.charset?.value)}`);
  lines.push(`  viewport         ${quote(meta.viewport?.value)}`);
  lines.push(`  robots           ${quote(meta.robots?.value)}`);

  lines.push("");
  lines.push("Open Graph");
  lines.push(`  og:title         ${quote(openGraph.title?.value)}`);
  lines.push(`  og:description   ${quote(openGraph.description?.value)}`);
  lines.push(`  og:type          ${quote(openGraph.type?.value)}`);
  lines.push(`  og:url           ${quote(openGraph.url?.value)}`);
  lines.push(`  og:site_name     ${quote(openGraph.siteName?.value)}`);
  lines.push(`  og:locale        ${quote(openGraph.locale?.value)}`);
  lines.push(`  og:image (${openGraph.images.length})`);
  for (const img of openGraph.images) {
    const dims =
      img.width?.value && img.height?.value ? ` (${img.width.value}x${img.height.value})` : "";
    lines.push(`    - ${img.url.value}${dims}`);
  }

  lines.push("");
  lines.push("Twitter / X");
  lines.push(`  twitter:card     ${quote(twitter.card?.value)}`);
  lines.push(`  twitter:title    ${quote(twitter.title?.value)}`);
  lines.push(`  twitter:image    ${quote(twitter.image?.value)}`);

  lines.push("");
  lines.push(`Links`);
  lines.push(`  hreflang (${links.alternates.length})`);
  for (const a of links.alternates) {
    lines.push(`    - ${a.hreflang}${a.isXDefault ? " (x-default)" : ""}  ${a.href}`);
  }
  lines.push(`  icons (${links.icons.length})`);
  for (const i of links.icons) {
    const sz = i.sizes ? ` ${i.sizes}` : "";
    lines.push(`    - ${i.rel}${sz}  ${i.href}`);
  }
  if (links.manifest) lines.push(`  manifest         ${links.manifest.href}`);
  if (links.feeds.length > 0) {
    lines.push(`  feeds (${links.feeds.length})`);
    for (const f of links.feeds) lines.push(`    - ${f.type}  ${f.href}`);
  }

  lines.push("");
  lines.push(`JSON-LD blocks: ${jsonLd.length}`);
  for (const b of jsonLd) {
    const types = b.types.length > 0 ? b.types.join(", ") : "(no @type)";
    const err = b.parseError ? `  ! ${b.parseError}` : "";
    lines.push(`  [${b.index}] ${types}${err}`);
  }

  lines.push("");
  lines.push("Probes");
  if (probes.robots) {
    lines.push(
      `  robots.txt       ${probes.robots.found ? "found" : "not found"}` +
        ` (${probes.robots.status})` +
        (probes.robots.found ? `, ${probes.robots.sitemaps.length} Sitemap(s)` : ""),
    );
  }
  if (probes.sitemap) {
    lines.push(
      `  sitemap.xml      ${probes.sitemap.found ? "found" : "not found"}` +
        ` (${probes.sitemap.status})` +
        (probes.sitemap.found
          ? `, ${probes.sitemap.entryCount} entries${probes.sitemap.isIndex ? " (index)" : ""}`
          : ""),
    );
  }
  if (probes.manifest) {
    lines.push(
      `  manifest         ${probes.manifest.found ? "found" : "not found"}` +
        ` (${probes.manifest.status})` +
        (probes.manifest.parseError ? `, parse error: ${probes.manifest.parseError}` : ""),
    );
  }

  return lines.join("\n");
}

function quote(value: string | undefined): string {
  if (value === undefined) return "(none)";
  return JSON.stringify(value);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / 1024 / 1024).toFixed(2)} MiB`;
}
