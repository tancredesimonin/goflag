"use client";

/**
 * Google SERP — desktop result.
 *
 * Layout mirrors a current desktop result tile: site chip (favicon + host),
 * URL breadcrumb, blue clickable title, grey snippet description.
 *
 * Truncation rules:
 *  - title: ~60 characters (Google empirically cuts around 580 px)
 *  - description: ~155 characters
 */

import { displayHost, displayUrl } from "@/lib/previews/resolve";
import { truncateGraphemes } from "@/lib/previews/shared/truncate";
import { PreviewFooter } from "@/lib/previews/shared/preview-footer";
import { PreviewImage } from "@/lib/previews/shared/preview-image";
import type { PreviewProps } from "@/lib/previews/types";

export function GoogleSerpDesktop({ data }: PreviewProps) {
  const url = data.url.value ?? "";
  const host = displayHost(url);
  const breadcrumb = displayUrl(url) || "(no URL)";
  const title = data.title.value ? truncateGraphemes(data.title.value, 60) : "(missing title)";
  const description = data.description.value
    ? truncateGraphemes(data.description.value, 155)
    : "No description provided.";
  const siteName = data.siteName.value ?? host;

  return (
    <div className="space-y-3" data-testid="preview-google-serp-desktop">
      <article
        className="bg-background text-foreground max-w-[640px] rounded-lg border p-4 font-sans"
        data-testid="preview-card"
      >
        <header className="flex items-center gap-2">
          <PreviewImage
            src={data.favicon.value}
            alt=""
            className="size-7 shrink-0 rounded-full bg-white p-1 ring-1 ring-black/5"
          />
          <div className="min-w-0">
            <div className="text-foreground truncate text-sm font-medium">{siteName}</div>
            <div className="text-muted-foreground truncate text-xs">{breadcrumb}</div>
          </div>
        </header>
        <h2
          className="mt-1.5 text-[20px] leading-snug font-normal text-[#1a0dab] dark:text-[#8ab4f8]"
          data-testid="serp-title"
        >
          {title}
        </h2>
        <p className="mt-1 text-sm leading-snug text-[#4d5156] dark:text-[#bdc1c6]">
          {description}
        </p>
      </article>
      <PreviewFooter data={data} />
    </div>
  );
}
