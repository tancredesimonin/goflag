"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import type { IconLink } from "@/lib/core/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface FaviconGridProps {
  icons: IconLink[];
}

/**
 * Renders every `<link rel="icon">` / `<link rel="apple-touch-icon">` at
 * its declared size. Catches the most common favicon mistakes by eye
 * (missing 180×180 apple-touch-icon, declared sizes that don't match the
 * real image, broken URLs).
 */
export function FaviconGrid({ icons }: FaviconGridProps) {
  if (icons.length === 0) {
    return (
      <Card className="border-border/40 border-dashed">
        <CardContent className="text-muted-foreground p-6 text-sm">
          No favicons declared. Browsers will fall back to <code>/favicon.ico</code> at the site
          root.
        </CardContent>
      </Card>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4" data-testid="favicon-grid">
      {icons.map((icon, idx) => (
        <FaviconTile key={`${icon.href}-${idx}`} icon={icon} />
      ))}
    </ul>
  );
}

function FaviconTile({ icon }: { icon: IconLink }) {
  const [errored, setErrored] = useState(false);
  const declaredSize = formatDeclaredSize(icon);
  return (
    <li>
      <Card className="border-border/60 h-full">
        <CardContent className="flex flex-col items-center gap-2 p-4">
          <div
            className={cn(
              "bg-muted/40 ring-border/40 flex size-20 items-center justify-center rounded-md ring-1",
              errored && "text-muted-foreground/60",
            )}
          >
            {errored ? (
              <ImageOff className="size-6" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={icon.href}
                alt={`${icon.rel} ${declaredSize}`}
                className="max-h-16 max-w-16 object-contain"
                onError={() => setErrored(true)}
                data-testid="favicon-img"
              />
            )}
          </div>
          <div className="flex w-full flex-col items-center gap-1">
            <Badge variant="outline" className="text-[10px] tracking-wide uppercase">
              {icon.rel}
            </Badge>
            <span
              className="text-muted-foreground font-mono text-[10px]"
              data-testid="favicon-size"
            >
              {declaredSize}
            </span>
            <span
              className="text-muted-foreground/60 w-full truncate text-center text-[10px]"
              title={icon.href}
            >
              {shortHref(icon.href)}
            </span>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

function formatDeclaredSize(icon: IconLink): string {
  if (icon.parsedSizes.length === 0) return icon.sizes ?? "(no size)";
  const first = icon.parsedSizes[0];
  if (first === "any") return "any";
  return `${first?.width}×${first?.height}`;
}

function shortHref(href: string): string {
  try {
    const u = new URL(href);
    return u.pathname.split("/").pop() || u.host;
  } catch {
    return href.split("/").pop() ?? href;
  }
}
