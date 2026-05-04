"use client";

/**
 * X (Twitter) `summary_large_image` card.
 *
 * Layout: a 1.91:1 image fills the top of the card, then a footer strip
 * shows the host on the left and the title on the right line. The card
 * sits inside a rounded-corner container with a 1px border, matching what
 * X currently renders in-stream.
 */

import { displayHost } from "@/lib/previews/resolve";
import { truncateGraphemes } from "@/lib/previews/shared/truncate";
import { PreviewFooter } from "@/lib/previews/shared/preview-footer";
import { PreviewImage } from "@/lib/previews/shared/preview-image";
import type { PreviewProps } from "@/lib/previews/types";

export function XCardSummaryLarge({ data }: PreviewProps) {
  const url = data.url.value ?? "";
  const host = displayHost(url);
  const title = data.title.value ? truncateGraphemes(data.title.value, 70) : "(missing title)";
  const image = data.image.value;

  return (
    <div className="space-y-3" data-testid="preview-x-card-summary-large">
      <article
        className="bg-background text-foreground max-w-[504px] overflow-hidden rounded-2xl border font-sans"
        data-testid="preview-card"
      >
        <PreviewImage
          src={image?.url}
          alt={image?.alt ?? title}
          className="aspect-[1.91/1] w-full"
          data-testid="x-large-image"
        />
        <div className="border-border/60 bg-background pointer-events-none absolute" />
        <div className="bg-background/95 border-border/60 -mt-px border-t px-4 py-2.5">
          <div className="text-muted-foreground truncate text-[13px]">{host}</div>
          <div
            className="text-foreground line-clamp-2 text-[15px] font-normal"
            data-testid="x-large-title"
          >
            {title}
          </div>
        </div>
      </article>
      <PreviewFooter data={data} />
    </div>
  );
}
