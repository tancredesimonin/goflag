"use client";

/**
 * Google SERP — mobile result.
 *
 * Mobile tiles wrap the result in a soft card with rounded corners, push
 * the favicon + site name to the top row, and allow ~70 characters of
 * title before truncation.
 */

import { displayHost, displayUrl } from "@/lib/previews/resolve";
import { truncateGraphemes } from "@/lib/previews/shared/truncate";
import { PreviewFooter } from "@/lib/previews/shared/preview-footer";
import { PreviewImage } from "@/lib/previews/shared/preview-image";
import type { PreviewProps } from "@/lib/previews/types";

export function GoogleSerpMobile({ data }: PreviewProps) {
  const url = data.url.value ?? "";
  const host = displayHost(url);
  const breadcrumb = displayUrl(url) || "(no URL)";
  const title = data.title.value ? truncateGraphemes(data.title.value, 70) : "(missing title)";
  const description = data.description.value
    ? truncateGraphemes(data.description.value, 155)
    : "No description provided.";
  const siteName = data.siteName.value ?? host;

  return (
    <div className="space-y-3" data-testid="preview-google-serp-mobile">
      <article
        className="bg-background text-foreground max-w-[400px] rounded-2xl border p-3 font-sans shadow-sm"
        data-testid="preview-card"
      >
        <header className="flex items-center gap-2">
          <PreviewImage
            src={data.favicon.value}
            alt=""
            className="size-6 shrink-0 rounded-full bg-white p-0.5 ring-1 ring-black/5"
          />
          <div className="min-w-0">
            <div className="text-foreground truncate text-[13px] font-medium">{siteName}</div>
            <div className="text-muted-foreground truncate text-[11px]">{breadcrumb}</div>
          </div>
        </header>
        <h2
          className="mt-1.5 text-[18px] leading-snug font-normal text-[#1a0dab] dark:text-[#8ab4f8]"
          data-testid="serp-title"
        >
          {title}
        </h2>
        <p className="mt-1 text-[13px] leading-snug text-[#4d5156] dark:text-[#bdc1c6]">
          {description}
        </p>
      </article>
      <PreviewFooter data={data} />
    </div>
  );
}
