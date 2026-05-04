"use client";

/**
 * LinkedIn shared post card.
 *
 * The image enforces a 1.91:1 ratio (LinkedIn crops anything else with a
 * letterbox). When no image is declared LinkedIn shows a neutral grey
 * tile rather than collapsing the layout — we mirror that with the
 * default {@link PreviewImage} fallback.
 *
 * Title clamps to ~119 characters in one line on desktop.
 */

import { displayHost } from "@/lib/previews/resolve";
import { truncateGraphemes } from "@/lib/previews/shared/truncate";
import { PreviewFooter } from "@/lib/previews/shared/preview-footer";
import { PreviewImage } from "@/lib/previews/shared/preview-image";
import type { PreviewProps } from "@/lib/previews/types";

export function LinkedInCard({ data }: PreviewProps) {
  const url = data.url.value ?? "";
  const host = displayHost(url);
  const title = data.title.value ? truncateGraphemes(data.title.value, 119) : "(missing title)";
  const image = data.image.value;
  const wrongRatio = image?.ratio !== undefined && Math.abs(image.ratio - 1.91) > 0.25;

  return (
    <div className="space-y-3" data-testid="preview-linkedin">
      <article
        className="bg-background text-foreground max-w-[504px] overflow-hidden rounded-md border font-sans"
        data-testid="preview-card"
      >
        <PreviewImage
          src={image?.url}
          alt={image?.alt ?? title}
          className="aspect-[1.91/1] w-full"
        />
        <div className="border-border/60 bg-background border-t px-4 py-3">
          <div
            className="text-foreground line-clamp-2 text-[15px] font-semibold"
            data-testid="linkedin-title"
          >
            {title}
          </div>
          <div className="text-muted-foreground mt-1 truncate text-[12px]">{host}</div>
          {wrongRatio && (
            <div
              className="mt-1 text-[11px] text-amber-600 dark:text-amber-400/90"
              data-testid="linkedin-warn-ratio"
            >
              Image isn&apos;t 1.91:1 — LinkedIn will crop or letterbox it.
            </div>
          )}
        </div>
      </article>
      <PreviewFooter data={data} />
    </div>
  );
}
