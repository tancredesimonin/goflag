"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { originDomId } from "@/lib/core/origin-key";
import type { AnnotatedRawTag } from "./annotations";

/**
 * Custom event the Issues tab dispatches when the user clicks
 * "Jump to tag". The `originKey(...)` payload identifies the row to
 * scroll to. We listen on `document` so any sibling component can
 * trigger a jump without prop drilling through the tab tree.
 */
export const JUMP_TO_ORIGIN_EVENT = "goflag:jump-to-origin";

export interface AnnotatedHighlightedTag extends AnnotatedRawTag {
  /** Pre-rendered shiki HTML for this tag. */
  highlighted: string;
}

export interface RawHeadViewerProps {
  /** One row per `<head>` tag, paired with its annotation + highlighted HTML. */
  tags: AnnotatedHighlightedTag[];
}

/**
 * Side-by-side raw `<head>` browser: each row shows the syntax-highlighted
 * tag (left) and reveals its human meaning + which crawlers consume it on
 * hover (right tooltip). A search box filters by raw text or annotation
 * label so users can jump to "og:image" or "twitter" instantly.
 */
export function RawHeadViewer({ tags }: RawHeadViewerProps) {
  const [query, setQuery] = useState("");
  const [flashId, setFlashId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter(
      (t) =>
        t.html.toLowerCase().includes(q) ||
        t.annotation.label.toLowerCase().includes(q) ||
        t.annotation.description.toLowerCase().includes(q),
    );
  }, [tags, query]);

  // Listen for jump-to-origin requests dispatched by the Issues panel.
  // We clear any active filter so the target row can never be hidden,
  // then scroll the row into view and flash a highlight ring.
  useEffect(() => {
    function onJump(event: Event) {
      const detail = (event as CustomEvent<string>).detail;
      if (!detail) return;
      setQuery("");
      const id = `goflag-origin-${detail}`;
      requestAnimationFrame(() => {
        const el = document.getElementById(id);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setFlashId(id);
        window.setTimeout(() => setFlashId((current) => (current === id ? null : current)), 1500);
      });
    }
    document.addEventListener(JUMP_TO_ORIGIN_EVENT, onJump);
    return () => document.removeEventListener(JUMP_TO_ORIGIN_EVENT, onJump);
  }, []);

  return (
    <TooltipProvider delay={150}>
      <div className="flex flex-col gap-3" data-testid="raw-head-viewer">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            type="search"
            placeholder="Filter by tag, value, or annotation…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 pr-9 pl-8 font-mono text-xs"
            aria-label="Filter raw head tags"
            data-testid="raw-filter"
          />
          {query ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-1/2 right-1 size-7 -translate-y-1/2"
              onClick={() => setQuery("")}
              aria-label="Clear filter"
            >
              <X className="size-3.5" />
            </Button>
          ) : null}
        </div>

        <ScrollArea className="border-border/60 bg-muted/20 max-h-[60vh] rounded-md border">
          <ol className="divide-border/40 divide-y" data-testid="raw-tag-list">
            {filtered.length === 0 ? (
              <li className="text-muted-foreground p-6 text-center text-sm">
                Nothing matches &ldquo;{query}&rdquo;.
              </li>
            ) : (
              filtered.map((t, idx) => {
                const id = t.origin ? originDomId(t.origin) : undefined;
                const isFlashing = id !== undefined && id === flashId;
                return (
                  <li
                    key={idx}
                    id={id}
                    className={cn(
                      "group transition-colors",
                      isFlashing && "bg-amber-100/70 dark:bg-amber-500/20",
                    )}
                    data-tag-kind={t.kind}
                    data-testid="raw-tag-li"
                  >
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button
                            type="button"
                            className={cn(
                              "hover:bg-muted/40 flex w-full items-start gap-3 px-4 py-2 text-left transition-colors",
                              "focus-visible:bg-muted/60 focus-visible:outline-none",
                            )}
                            data-testid="raw-tag-row"
                          >
                            <span className="text-muted-foreground/60 w-6 shrink-0 pt-1 text-right font-mono text-[10px] tabular-nums">
                              {idx + 1}
                            </span>
                            <div
                              className="raw-tag-highlight min-w-0 flex-1 overflow-x-auto font-mono text-xs"
                              // shiki output is trusted — produced server-side from our parsed Page.
                              dangerouslySetInnerHTML={{ __html: t.highlighted }}
                            />
                            <span className="text-muted-foreground/60 hidden shrink-0 truncate text-[10px] tracking-wider uppercase sm:inline-block sm:max-w-[14rem]">
                              {t.annotation.label}
                            </span>
                          </button>
                        }
                      />
                      <TooltipContent
                        side="left"
                        align="start"
                        sideOffset={8}
                        className="max-w-sm space-y-1.5"
                      >
                        <div className="text-foreground text-xs font-semibold">
                          {t.annotation.label}
                        </div>
                        <p className="text-muted-foreground text-xs leading-relaxed">
                          {t.annotation.description}
                        </p>
                        {t.annotation.consumers && t.annotation.consumers.length > 0 ? (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {t.annotation.consumers.map((c) => (
                              <Badge key={c} variant="secondary" className="text-[10px]">
                                {c}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </TooltipContent>
                    </Tooltip>
                  </li>
                );
              })
            )}
          </ol>
        </ScrollArea>

        <p className="text-muted-foreground/60 text-[11px]">
          {filtered.length} of {tags.length} tag{tags.length === 1 ? "" : "s"} · hover any row for
          its meaning and which crawlers consume it.
        </p>
      </div>
    </TooltipProvider>
  );
}
