"use client";

/**
 * Discord embed. Discord renders link unfurls as a card with a coloured
 * left border (driven by `theme-color`), site name as a small label, then
 * title (clickable, blue), description, and image.
 */

import { displayHost } from "@/lib/previews/resolve";
import { truncateGraphemes } from "@/lib/previews/shared/truncate";
import { PreviewFooter } from "@/lib/previews/shared/preview-footer";
import { PreviewImage } from "@/lib/previews/shared/preview-image";
import type { PreviewProps } from "@/lib/previews/types";

export function DiscordEmbed({ data }: PreviewProps) {
  const url = data.url.value ?? "";
  const host = displayHost(url);
  const title = data.title.value ? truncateGraphemes(data.title.value, 256) : "(missing title)";
  const description = data.description.value ? truncateGraphemes(data.description.value, 280) : "";
  const siteName = data.siteName.value ?? host;
  const image = data.image.value;
  const accent = data.extras.themeColor ?? "#5865F2";

  return (
    <div className="space-y-3" data-testid="preview-discord">
      <article
        className="max-w-[520px] overflow-hidden rounded-l-sm rounded-r-md border border-l-0 border-[#1f2125] bg-[#2b2d31] font-sans text-[#dbdee1]"
        data-testid="preview-card"
      >
        <div className="flex">
          <div
            className="w-1 shrink-0"
            style={{ background: accent }}
            data-testid="discord-accent"
          />
          <div className="min-w-0 flex-1 p-3">
            {siteName && <div className="text-[12px] text-[#a8aaad]">{siteName}</div>}
            <div
              className="mt-0.5 text-[15px] leading-snug font-semibold text-[#00a8fc]"
              data-testid="discord-title"
            >
              {title}
            </div>
            {description && (
              <p className="mt-1 line-clamp-3 text-[13px] leading-snug text-[#dbdee1]">
                {description}
              </p>
            )}
            {image && (
              <PreviewImage
                src={image.url}
                alt={image.alt ?? title}
                className="mt-2 aspect-[16/9] w-full max-w-[400px] rounded-md"
              />
            )}
          </div>
        </div>
      </article>
      <PreviewFooter data={data} />
    </div>
  );
}
