"use client";

/**
 * Slack unfurl. Slack renders link unfurls inside a chat bubble with a
 * thin grey left border. The site name (`og:site_name`) sits as a small
 * row above the title; the image floats to the right when present.
 */

import { displayHost } from "@/lib/previews/resolve";
import { truncateGraphemes } from "@/lib/previews/shared/truncate";
import { PreviewFooter } from "@/lib/previews/shared/preview-footer";
import { PreviewImage } from "@/lib/previews/shared/preview-image";
import type { PreviewProps } from "@/lib/previews/types";

export function SlackUnfurl({ data }: PreviewProps) {
  const url = data.url.value ?? "";
  const host = displayHost(url);
  const title = data.title.value ? truncateGraphemes(data.title.value, 96) : "(missing title)";
  const description = data.description.value ? truncateGraphemes(data.description.value, 280) : "";
  const siteName = data.siteName.value ?? host;
  const image = data.image.value;

  return (
    <div className="space-y-3" data-testid="preview-slack">
      <article
        className="max-w-[540px] font-sans text-[#1d1c1d] dark:text-[#e8e8e8]"
        data-testid="preview-card"
      >
        <div className="flex gap-2">
          <div className="w-1 shrink-0 rounded-sm bg-[#dddddd] dark:bg-[#3f3f3f]" aria-hidden />
          <div className="bg-background flex min-w-0 flex-1 gap-3 rounded-r p-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[12px] text-[#616061] dark:text-[#9b9b9b]">
                <PreviewImage
                  src={data.favicon.value}
                  alt=""
                  className="size-4 shrink-0 rounded-sm bg-white p-0.5 ring-1 ring-black/5"
                />
                <span className="truncate">{siteName}</span>
              </div>
              <div
                className="mt-1 text-[15px] leading-snug font-bold text-[#1264a3] dark:text-[#1d9bd1]"
                data-testid="slack-title"
              >
                {title}
              </div>
              {description && (
                <p className="mt-1 line-clamp-3 text-[14px] leading-snug">{description}</p>
              )}
            </div>
            {image && (
              <PreviewImage
                src={image.url}
                alt={image.alt ?? title}
                className="aspect-[1.91/1] w-32 shrink-0 rounded-md"
              />
            )}
          </div>
        </div>
      </article>
      <PreviewFooter data={data} />
    </div>
  );
}
