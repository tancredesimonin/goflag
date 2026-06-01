"use client";

/**
 * Previews tab — a single scrolling column of every platform unfurl with a
 * sticky, scroll-linked sidebar, plus a "What if?" toggle drawer that lets
 * the user suppress individual `<head>` tags and watch every preview degrade
 * in real time.
 *
 * Architecture:
 *
 *  - The tab is a single client component holding one piece of state:
 *      `removed` — `Set<TagKey>` driving the resolver re-runs.
 *  - Every preview is rendered, stacked vertically one per row. The sidebar
 *    lists each platform (grouped by category); clicking an entry smooth
 *    scrolls to that preview, and a scroll spy highlights whichever preview
 *    is currently in view.
 *  - All resolution happens client-side via {@link resolvePreview}, so the
 *    cards re-render immediately as the toggles change. The resolver is
 *    pure and cheap (it walks `page.raw.metas` once per platform).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, RotateCcw, Sliders } from "lucide-react";
import type { Page } from "@/lib/core/types";
import { PREVIEW_COMPONENTS, PREVIEW_PLATFORMS, listTagKeys, resolvePreview } from "@/lib/previews";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface PreviewsTabProps {
  page: Page;
}

export function PreviewsTab({ page }: PreviewsTabProps) {
  const allTags = useMemo(() => listTagKeys(page), [page]);
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());

  const toggle = (key: string) => {
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const reset = () => setRemoved(new Set());

  const data = useMemo(
    () =>
      PREVIEW_PLATFORMS.map((p) => ({
        platform: p,
        resolved: resolvePreview(p.id, page, { removed }),
      })),
    [page, removed],
  );

  return (
    <div className="space-y-4" data-testid="previews-tab">
      <Toolbar allTags={allTags} removed={removed} toggle={toggle} reset={reset} />
      <PreviewsStack page={page} data={data} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

function Toolbar({
  allTags,
  removed,
  toggle,
  reset,
}: {
  allTags: ReturnType<typeof listTagKeys>;
  removed: Set<string>;
  toggle: (k: string) => void;
  reset: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="ml-auto flex items-center gap-2">
        {removed.size > 0 && (
          <Badge variant="outline" data-testid="previews-removed-count">
            {removed.size} suppressed
          </Badge>
        )}
        {removed.size > 0 && (
          <Button variant="ghost" size="sm" onClick={reset} data-testid="previews-reset">
            <RotateCcw className="size-4" />
            Reset
          </Button>
        )}
        <Sheet>
          <SheetTrigger
            render={
              <Button variant="outline" size="sm" data-testid="whatif-trigger">
                <Sliders className="size-4" />
                What if?
              </Button>
            }
          />
          <SheetContent
            side="right"
            className="flex w-[360px] flex-col p-0 sm:max-w-md"
            data-testid="whatif-sheet"
          >
            <SheetHeader className="border-b p-4">
              <SheetTitle>Suppress tags</SheetTitle>
              <p className="text-muted-foreground text-xs">
                Toggle a tag off to see how every preview degrades. The page isn&apos;t modified —
                this only affects the resolver.
              </p>
            </SheetHeader>
            <ScrollArea className="flex-1">
              <ul className="divide-y">
                {allTags.map((t) => {
                  const off = removed.has(t.key);
                  return (
                    <li
                      key={t.key}
                      data-testid="whatif-row"
                      data-key={t.key}
                      data-suppressed={off ? "true" : "false"}
                    >
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!off}
                        onClick={() => toggle(t.key)}
                        className={cn(
                          "hover:bg-muted/40 flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors",
                          off && "opacity-60",
                        )}
                        aria-label={`${off ? "Restore" : "Suppress"} ${t.label}`}
                        data-testid="whatif-toggle"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-foreground truncate font-mono text-[12px]">
                            {t.label}
                          </div>
                          <div className="text-muted-foreground/80 truncate text-[10px]">
                            {t.key}
                          </div>
                        </div>
                        {off ? (
                          <EyeOff className="text-muted-foreground size-4" aria-hidden />
                        ) : (
                          <Eye className="text-muted-foreground size-4" aria-hidden />
                        )}
                      </button>
                    </li>
                  );
                })}
                {allTags.length === 0 && (
                  <li className="text-muted-foreground p-4 text-sm">No &lt;head&gt; tags found.</li>
                )}
              </ul>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stacked previews + scroll-linked sidebar
// ---------------------------------------------------------------------------

type PreviewItem = {
  platform: (typeof PREVIEW_PLATFORMS)[number];
  resolved: ReturnType<typeof resolvePreview>;
};

function PreviewsStack({ page, data }: { page: Page; data: PreviewItem[] }) {
  const sections = useRef<Record<string, HTMLElement | null>>({});
  const [active, setActive] = useState<string>(() => data[0]?.platform.id ?? "");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const els = Object.values(sections.current).filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const id = visible[0]?.target.getAttribute("data-platform");
        if (id) setActive(id);
      },
      // Bias the "active" zone toward the top third of the viewport so the
      // highlight tracks the preview the reader is actually looking at.
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 },
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [data]);

  const scrollTo = (id: string) => {
    setActive(id);
    sections.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const groups = useMemo(() => groupByCategory(data), [data]);

  return (
    <div className="grid gap-6 lg:grid-cols-[200px_1fr]" data-testid="previews-stack">
      <nav
        aria-label="Jump to preview"
        className="bg-card/40 self-start rounded-md border p-2 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto"
        data-testid="previews-nav"
      >
        {groups.map(({ name, items }) =>
          items.length === 0 ? null : (
            <div key={name} className="mb-2 last:mb-0">
              <div className="text-muted-foreground px-2 py-1 text-[10px] font-medium tracking-wider uppercase">
                {name}
              </div>
              <ul className="space-y-0.5">
                {items.map(({ platform }) => (
                  <li key={platform.id}>
                    <button
                      type="button"
                      onClick={() => scrollTo(platform.id)}
                      className={cn(
                        "hover:bg-muted/60 w-full rounded px-2 py-1.5 text-left text-xs transition-colors",
                        platform.id === active && "bg-muted text-foreground font-medium",
                      )}
                      aria-current={platform.id === active ? "true" : undefined}
                      data-testid="previews-nav-link"
                      data-platform={platform.id}
                    >
                      {platform.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ),
        )}
      </nav>

      <div className="min-w-0 space-y-6">
        {data.map(({ platform, resolved }) => {
          const Comp = PREVIEW_COMPONENTS[platform.id];
          return (
            <section
              key={platform.id}
              id={`preview-${platform.id}`}
              ref={(el) => {
                sections.current[platform.id] = el;
              }}
              className="scroll-mt-4"
              data-platform={platform.id}
            >
              <Card
                className="overflow-hidden"
                data-testid="preview-tile"
                data-platform={platform.id}
              >
                <CardHeader>
                  <CardTitle className="text-sm font-medium">{platform.name}</CardTitle>
                </CardHeader>
                <CardContent className="flex justify-center pt-0">
                  <Comp data={resolved} page={page} />
                </CardContent>
              </Card>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function groupByCategory(data: PreviewItem[]) {
  const order = ["search", "social", "messaging"] as const;
  const labels: Record<(typeof order)[number], string> = {
    search: "Search",
    social: "Social",
    messaging: "Messaging",
  };
  return order.map((g) => ({
    name: labels[g],
    items: data.filter((d) => d.platform.group === g),
  }));
}
