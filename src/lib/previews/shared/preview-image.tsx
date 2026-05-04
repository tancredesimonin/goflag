"use client";

/**
 * Shared image renderer for preview cards. Falls back to a typographic
 * placeholder when the image fails to load (or when the field is absent),
 * so previews always look "complete" even on broken pages.
 *
 * Native `<img>` is intentional: we render arbitrary user-supplied URLs
 * that won't match any `next.config.js` `images.domains` entry, and the
 * preview cards are always rendered at fixed pixel sizes (no need for
 * srcset wizardry).
 */

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface PreviewImageProps {
  src?: string;
  alt?: string;
  className?: string;
  /** Show a small icon when the image is missing or fails to load. */
  fallbackIcon?: boolean;
  /** When true, the placeholder uses the image alt text as a label. */
  showAltOnFallback?: boolean;
  /** Optional data-testid for tests. */
  "data-testid"?: string;
}

export function PreviewImage({
  src,
  alt,
  className,
  fallbackIcon = true,
  showAltOnFallback = false,
  "data-testid": testId,
}: PreviewImageProps) {
  const [failed, setFailed] = useState(false);
  const broken = !src || failed;

  return (
    <div
      className={cn("bg-muted/60 text-muted-foreground relative overflow-hidden", className)}
      data-testid={testId}
      data-broken={broken ? "true" : undefined}
    >
      {!broken && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt ?? ""}
          className="block h-full w-full object-cover"
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
      {broken && (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-center">
          {fallbackIcon && <ImageOff className="size-6 opacity-60" aria-hidden />}
          {showAltOnFallback && alt && <span className="text-xs leading-tight">{alt}</span>}
          {!showAltOnFallback && (
            <span className="text-[10px] tracking-wide uppercase opacity-70">No image</span>
          )}
        </div>
      )}
    </div>
  );
}
