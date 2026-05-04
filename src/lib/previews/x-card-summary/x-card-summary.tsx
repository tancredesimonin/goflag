"use client";

/**
 * X (Twitter) `summary` card. Square thumbnail on the left, text on the
 * right (title + truncated description + host). Used for content where the
 * page hasn't opted into the larger card format.
 */

import { displayHost } from "@/lib/previews/resolve";
import { truncateGraphemes } from "@/lib/previews/shared/truncate";
import { PreviewFooter } from "@/lib/previews/shared/preview-footer";
import { PreviewImage } from "@/lib/previews/shared/preview-image";
import type { PreviewProps } from "@/lib/previews/types";

export function XCardSummary({ data }: PreviewProps) {
  const url = data.url.value ?? "";
  const host = displayHost(url);
  const title = data.title.value ? truncateGraphemes(data.title.value, 70) : "(missing title)";
  const description = data.description.value ? truncateGraphemes(data.description.value, 120) : "";
  const image = data.image.value;

  return (
    <div className="space-y-3" data-testid="preview-x-card-summary">
      <article
        className="bg-background text-foreground flex max-w-[504px] gap-0 overflow-hidden rounded-2xl border font-sans"
        data-testid="preview-card"
      >
        <PreviewImage
          src={image?.url}
          alt={image?.alt ?? title}
          className="aspect-square w-32 shrink-0 border-r"
        />
        <div className="bg-background flex min-w-0 flex-col justify-center px-4 py-3">
          <div className="text-muted-foreground truncate text-xs">{host}</div>
          <div
            className="text-foreground mt-0.5 line-clamp-2 text-sm font-normal"
            data-testid="x-summary-title"
          >
            {title}
          </div>
          {description && (
            <div className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">{description}</div>
          )}
        </div>
      </article>
      <PreviewFooter data={data} />
    </div>
  );
}
