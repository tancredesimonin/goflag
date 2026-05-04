"use client";

/**
 * Per-card footer that explains:
 *
 *  - which raw `<head>` tags this preview consumed;
 *  - any fallbacks it had to fall back through (e.g. "no `og:title` →
 *    fell back to `<title>`");
 *  - missing critical pieces (e.g. "no image declared").
 *
 * This is the Phase 4.14 deliverable. The footer is deliberately quiet by
 * default — small chips below the card — and expands on click to reveal
 * the full fallback narrative for each field.
 */

import { useId, useState } from "react";
import { ChevronDown, AlertTriangle } from "lucide-react";
import type { PreviewData, PreviewField } from "@/lib/previews/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PreviewFooterProps {
  data: PreviewData;
  className?: string;
}

export function PreviewFooter({ data, className }: PreviewFooterProps) {
  const fallbackFields = collectFallbacks(data);
  const missing = collectMissing(data);

  const id = useId();
  const [open, setOpen] = useState(false);
  const hasDetails = fallbackFields.length > 0 || missing.length > 0;

  return (
    <div
      className={cn("text-muted-foreground space-y-2 text-xs", className)}
      data-testid="preview-footer"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground/70 mr-0.5 text-[10px] tracking-wider uppercase">
          Used
        </span>
        {data.consumed.length === 0 && (
          <span className="italic" data-testid="preview-footer-empty">
            No tags consumed
          </span>
        )}
        {dedupe(data.consumed.map((s) => s.label)).map((label) => (
          <Badge
            key={label}
            variant="secondary"
            className="font-mono text-[10px] font-normal"
            data-testid="preview-footer-tag"
          >
            {label}
          </Badge>
        ))}
        {hasDetails && (
          <button
            type="button"
            aria-controls={id}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="hover:text-foreground ml-auto inline-flex items-center gap-1 text-[10px] tracking-wider uppercase"
            data-testid="preview-footer-toggle"
          >
            {fallbackFields.length > 0
              ? `${fallbackFields.length} fallback${fallbackFields.length === 1 ? "" : "s"}`
              : `${missing.length} missing`}
            <ChevronDown
              aria-hidden
              className={cn("size-3 transition-transform", open && "rotate-180")}
            />
          </button>
        )}
      </div>
      {open && hasDetails && (
        <ul id={id} className="space-y-1 pl-1" data-testid="preview-footer-details">
          {fallbackFields.map((line) => (
            <li key={line} className="flex items-start gap-1.5">
              <span className="text-muted-foreground/60 mt-0.5">↳</span>
              <span>{line}</span>
            </li>
          ))}
          {missing.map((line) => (
            <li
              key={`missing:${line}`}
              className="flex items-start gap-1.5 text-amber-600 dark:text-amber-400/90"
            >
              <AlertTriangle className="mt-0.5 size-3" aria-hidden />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function collectFallbacks(data: PreviewData): string[] {
  const out: string[] = [];
  const fields: Array<[string, PreviewField<unknown>]> = [
    ["title", data.title],
    ["description", data.description],
    ["image", data.image],
    ["URL", data.url],
  ];
  for (const [name, field] of fields) {
    if (!field.source) continue;
    const idx = field.fallbackChain.findIndex((p) => p.source.key === field.source!.key);
    if (idx <= 0) continue;
    const skipped = field.fallbackChain.slice(0, idx).filter((p) => p.value === undefined);
    if (skipped.length === 0) continue;
    const skippedLabels = skipped.map((p) => p.source.label).join(", ");
    out.push(`${name}: missing ${skippedLabels} → fell back to ${field.source.label}`);
  }
  return out;
}

function collectMissing(data: PreviewData): string[] {
  const out: string[] = [];
  if (!data.title.value) out.push("No title source available");
  if (!data.description.value) out.push("No description declared");
  if (!data.image.value && expectsImage(data.platform)) {
    out.push("No image declared — card will look bare");
  }
  return out;
}

function expectsImage(platform: PreviewData["platform"]): boolean {
  return (
    platform !== "google-serp-desktop" &&
    platform !== "google-serp-mobile" &&
    platform !== "x-card-summary" // small image card visually tolerates no image
  );
}

function dedupe<T>(xs: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const x of xs) {
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}
