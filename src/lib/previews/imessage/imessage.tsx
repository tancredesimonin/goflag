"use client";

/**
 * iMessage link bubble. iOS renders shared links as a rounded "rich link"
 * bubble: image on top (when present), then a title row and a host strip.
 * When there's no `og:image`, iMessage falls back to a square favicon
 * with the title to its right — that fallback already lives in the
 * resolver so this component just renders what it's given.
 */

import { displayHost } from "@/lib/previews/resolve";
import { truncateGraphemes } from "@/lib/previews/shared/truncate";
import { PreviewFooter } from "@/lib/previews/shared/preview-footer";
import { PreviewImage } from "@/lib/previews/shared/preview-image";
import type { PreviewProps } from "@/lib/previews/types";

export function IMessageBubble({ data }: PreviewProps) {
  const url = data.url.value ?? "";
  const host = displayHost(url);
  const title = data.title.value ? truncateGraphemes(data.title.value, 70) : "(missing title)";
  const image = data.image.value;
  // iMessage uses the "compact" bubble (square favicon + title) when the
  // image source is the favicon fallback, and the "expanded" bubble (full
  // 1.91:1 image on top) when a real og:image is available.
  const compact = !image || image.url === data.favicon.value;

  return (
    <div className="space-y-3" data-testid="preview-imessage">
      <article
        className="max-w-[300px] overflow-hidden rounded-2xl bg-[#e9e9eb] font-sans text-black dark:bg-[#1f1f1f] dark:text-white"
        data-testid="preview-card"
      >
        {compact ? (
          <div className="flex items-center gap-2 p-2">
            <PreviewImage
              src={image?.url ?? data.favicon.value}
              alt=""
              className="size-12 shrink-0 rounded-md bg-white p-1.5 ring-1 ring-black/10"
              fallbackIcon
            />
            <div className="min-w-0">
              <div
                className="line-clamp-2 text-[13px] leading-tight font-medium"
                data-testid="imessage-title"
              >
                {title}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-[#3c3c4399] dark:text-[#ebebf599]">
                {host}
              </div>
            </div>
          </div>
        ) : (
          <>
            <PreviewImage
              src={image?.url}
              alt={image?.alt ?? title}
              className="aspect-[1.91/1] w-full"
            />
            <div className="px-3 py-2">
              <div
                className="line-clamp-2 text-[13px] leading-tight font-medium"
                data-testid="imessage-title"
              >
                {title}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-[#3c3c4399] dark:text-[#ebebf599]">
                {host}
              </div>
            </div>
          </>
        )}
      </article>
      <PreviewFooter data={data} />
    </div>
  );
}
