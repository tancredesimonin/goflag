"use client";

/**
 * Pinterest pin. Pins favour tall portrait images; if the source supplies
 * a wide image we keep it but fall back to a 4:3 box. Description is
 * generally hidden in the in-feed view but appears in the pin detail.
 */

import { displayHost } from "@/lib/previews/resolve";
import { truncateGraphemes } from "@/lib/previews/shared/truncate";
import { PreviewFooter } from "@/lib/previews/shared/preview-footer";
import { PreviewImage } from "@/lib/previews/shared/preview-image";
import type { PreviewProps } from "@/lib/previews/types";

export function PinterestPin({ data }: PreviewProps) {
  const url = data.url.value ?? "";
  const host = displayHost(url);
  const title = data.title.value ? truncateGraphemes(data.title.value, 100) : "(missing title)";
  const image = data.image.value;
  // Pins prefer 2:3 portrait. Narrow images fall through to whatever we
  // got; missing images render as a placeholder tile.
  const portrait = !image?.ratio || image.ratio < 1.0;
  const aspect = portrait ? "aspect-[2/3]" : "aspect-[1.91/1]";

  return (
    <div className="space-y-3" data-testid="preview-pinterest">
      <article
        className="bg-background text-foreground max-w-[260px] overflow-hidden rounded-2xl border font-sans"
        data-testid="preview-card"
      >
        <PreviewImage src={image?.url} alt={image?.alt ?? title} className={`${aspect} w-full`} />
        <div className="px-3 py-2.5">
          <div
            className="text-foreground line-clamp-2 text-[14px] leading-snug font-semibold"
            data-testid="pinterest-title"
          >
            {title}
          </div>
          <div className="text-muted-foreground mt-1 truncate text-[12px]">{host}</div>
        </div>
      </article>
      <PreviewFooter data={data} />
    </div>
  );
}
