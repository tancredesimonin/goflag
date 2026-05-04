"use client";

/**
 * Facebook feed card. The chrome mimics what a shared link looks like in
 * the Facebook timeline: large image on top, then a tinted footer block
 * with the host name (uppercase, small), bold title, and one-line
 * description.
 */

import { displayHost } from "@/lib/previews/resolve";
import { truncateGraphemes } from "@/lib/previews/shared/truncate";
import { PreviewFooter } from "@/lib/previews/shared/preview-footer";
import { PreviewImage } from "@/lib/previews/shared/preview-image";
import type { PreviewProps } from "@/lib/previews/types";

export function FacebookCard({ data }: PreviewProps) {
  const url = data.url.value ?? "";
  const host = displayHost(url);
  const title = data.title.value ? truncateGraphemes(data.title.value, 88) : "(missing title)";
  const description = data.description.value ? truncateGraphemes(data.description.value, 110) : "";
  const image = data.image.value;

  return (
    <div className="space-y-3" data-testid="preview-facebook">
      <article
        className="bg-background text-foreground max-w-[500px] overflow-hidden rounded-md border font-sans"
        data-testid="preview-card"
      >
        <PreviewImage
          src={image?.url}
          alt={image?.alt ?? title}
          className="aspect-[1.91/1] w-full"
        />
        <div className="bg-[#f0f2f5] px-3 py-2 dark:bg-[#1c1e21]">
          <div className="text-[12px] font-medium tracking-wide text-[#65676b] uppercase dark:text-[#b0b3b8]">
            {host}
          </div>
          <div
            className="text-foreground mt-0.5 line-clamp-2 text-[16px] leading-snug font-semibold"
            data-testid="facebook-title"
          >
            {title}
          </div>
          {description && (
            <div className="mt-0.5 line-clamp-1 text-[13px] text-[#65676b] dark:text-[#b0b3b8]">
              {description}
            </div>
          )}
        </div>
      </article>
      <PreviewFooter data={data} />
    </div>
  );
}
