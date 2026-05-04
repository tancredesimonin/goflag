"use client";

/**
 * WhatsApp link preview. WhatsApp shows a dense bubble with a small
 * square thumbnail on the left, then host / title / description stacked.
 * Background is a faint chat-grey to match the messaging surface.
 */

import { displayHost } from "@/lib/previews/resolve";
import { truncateGraphemes } from "@/lib/previews/shared/truncate";
import { PreviewFooter } from "@/lib/previews/shared/preview-footer";
import { PreviewImage } from "@/lib/previews/shared/preview-image";
import type { PreviewProps } from "@/lib/previews/types";

export function WhatsAppPreview({ data }: PreviewProps) {
  const url = data.url.value ?? "";
  const host = displayHost(url);
  const title = data.title.value ? truncateGraphemes(data.title.value, 65) : "(missing title)";
  const description = data.description.value ? truncateGraphemes(data.description.value, 100) : "";
  const image = data.image.value;

  return (
    <div className="space-y-3" data-testid="preview-whatsapp">
      <article
        className="max-w-[420px] overflow-hidden rounded-md bg-[#f0f2f5] font-sans text-[#111b21] dark:bg-[#202c33] dark:text-[#e9edef]"
        data-testid="preview-card"
      >
        <div className="flex">
          <PreviewImage
            src={image?.url}
            alt={image?.alt ?? title}
            className="aspect-square w-20 shrink-0"
          />
          <div className="min-w-0 flex-1 p-2.5">
            <div className="text-[12px] tracking-wide text-[#667781] uppercase dark:text-[#8696a0]">
              {host}
            </div>
            <div
              className="mt-0.5 line-clamp-2 text-[14px] leading-snug font-medium"
              data-testid="whatsapp-title"
            >
              {title}
            </div>
            {description && (
              <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-[#667781] dark:text-[#8696a0]">
                {description}
              </div>
            )}
          </div>
        </div>
      </article>
      <PreviewFooter data={data} />
    </div>
  );
}
