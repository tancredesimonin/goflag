"use client";

/**
 * Previews tab — gallery of all platform unfurls, "What if?" toggle drawer
 * that lets the user suppress individual `<head>` tags and watch every
 * preview degrade in real time.
 *
 * Architecture:
 *
 *  - The tab is a single client component holding two pieces of state:
 *      1. `removed` — `Set<TagKey>` driving the resolver re-runs.
 *      2. `focus` — optional platform id; null means "show the gallery",
 *         non-null means "show one big preview centered, with the others
 *         as a strip on the side". Clicking a card from the gallery opens
 *         focus; clicking the back button closes it.
 *  - All resolution happens client-side via {@link resolvePreview}, so the
 *    cards re-render immediately as the toggles change. The resolver is
 *    pure and cheap (it walks `page.raw.metas` once per platform).
 */

import { useMemo, useState } from "react";
import { ChevronLeft, Eye, EyeOff, RotateCcw, Sliders } from "lucide-react";
import type { Page } from "@/lib/core/types";
import {
  PREVIEW_COMPONENTS,
  PREVIEW_PLATFORMS,
  listTagKeys,
  resolvePreview,
  type PreviewPlatform,
} from "@/lib/previews";
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
  const [focus, setFocus] = useState<PreviewPlatform | null>(null);

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
      <Toolbar
        page={page}
        allTags={allTags}
        removed={removed}
        toggle={toggle}
        reset={reset}
        focus={focus}
        onClearFocus={() => setFocus(null)}
      />

      {focus === null ? (
        <Gallery page={page} data={data} onFocus={(p) => setFocus(p)} />
      ) : (
        <Focused page={page} platform={focus} data={data} onPick={setFocus} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

function Toolbar({
  page,
  allTags,
  removed,
  toggle,
  reset,
  focus,
  onClearFocus,
}: {
  page: Page;
  allTags: ReturnType<typeof listTagKeys>;
  removed: Set<string>;
  toggle: (k: string) => void;
  reset: () => void;
  focus: PreviewPlatform | null;
  onClearFocus: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {focus !== null && (
        <Button variant="ghost" size="sm" onClick={onClearFocus} data-testid="previews-back">
          <ChevronLeft className="size-4" />
          Back to gallery
        </Button>
      )}
      <div className="text-muted-foreground text-xs">
        Resolving against{" "}
        <span className="font-mono text-[11px]">
          {new URL(page.fetch.finalUrl).host.replace(/^www\./, "")}
        </span>
      </div>
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
// Gallery & Focus views
// ---------------------------------------------------------------------------

function Gallery({
  page,
  data,
  onFocus,
}: {
  page: Page;
  data: ReturnType<
    typeof useMemo<
      {
        platform: (typeof PREVIEW_PLATFORMS)[number];
        resolved: ReturnType<typeof resolvePreview>;
      }[]
    >
  >;
  onFocus: (p: PreviewPlatform) => void;
}) {
  const groups = useMemo(() => groupByCategory(data), [data]);

  return (
    <div className="space-y-6" data-testid="previews-gallery">
      {groups.map(({ name, items }) => (
        <section key={name} className="space-y-3">
          <h3 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
            {name}
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-2">
            {items.map(({ platform, resolved }) => {
              const Comp = PREVIEW_COMPONENTS[platform.id];
              return (
                <Card
                  key={platform.id}
                  className={cn("overflow-hidden")}
                  data-testid="preview-tile"
                  data-platform={platform.id}
                >
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{platform.name}</CardTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => onFocus(platform.id)}
                      data-testid="preview-focus"
                    >
                      Focus
                    </Button>
                  </CardHeader>
                  <CardContent className="flex justify-center pt-0">
                    <Comp data={resolved} page={page} />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function Focused({
  page,
  platform,
  data,
  onPick,
}: {
  page: Page;
  platform: PreviewPlatform;
  data: ReturnType<
    typeof useMemo<
      {
        platform: (typeof PREVIEW_PLATFORMS)[number];
        resolved: ReturnType<typeof resolvePreview>;
      }[]
    >
  >;
  onPick: (p: PreviewPlatform) => void;
}) {
  const item = data.find((d) => d.platform.id === platform);
  if (!item) return null;
  const Comp = PREVIEW_COMPONENTS[platform];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_220px]" data-testid="previews-focus">
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base font-medium">{item.platform.name}</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Comp data={item.resolved} page={page} />
        </CardContent>
      </Card>
      <nav
        aria-label="All platforms"
        className="bg-card/40 max-h-[600px] overflow-y-auto rounded-md border p-2"
      >
        <ul className="space-y-1">
          {data.map(({ platform: p }) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onPick(p.id)}
                className={cn(
                  "hover:bg-muted/60 w-full rounded px-2 py-1.5 text-left text-xs",
                  p.id === platform && "bg-muted text-foreground",
                )}
                data-testid="preview-focus-pick"
                data-platform={p.id}
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function groupByCategory(
  data: Array<{
    platform: (typeof PREVIEW_PLATFORMS)[number];
    resolved: ReturnType<typeof resolvePreview>;
  }>,
) {
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
