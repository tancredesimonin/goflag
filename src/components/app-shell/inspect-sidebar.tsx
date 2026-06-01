"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Globe, Languages } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

export interface InspectSidebarItem {
  /** Full URL the user originally inspected. */
  url: string;
  /** Final URL after redirects (used for display when different). */
  finalUrl: string;
  /** Document title, falling back to the URL pathname. */
  title: string;
  /** ISO 639-1 locale (e.g. "fr", "en-US"); empty when unknown. */
  locale: string;
  /** When the engine produced this entry, formatted for tooltips. */
  storedAt: number;
  /** HTTP status code from the fetch. `0` for sitemap URLs not yet inspected. */
  status: number;
  /** Which extractor produced the result; undefined when not yet inspected. */
  extractor?: "static" | "headless";
  /** True when the page has actually been inspected (vs. listed from the sitemap). */
  inspected: boolean;
}

export interface InspectSidebarProps {
  items: InspectSidebarItem[];
  /** Section above the list — typically the active page's title. */
  brand?: string;
}

/**
 * Sidebar listing every URL inspected during this session, grouped by
 * locale (per PLAN 3.3). Items render as links to /inspect?url=…; the
 * active item is derived from the current `?url=…` query string.
 */
export function InspectSidebar({ items, brand = "Headlint" }: InspectSidebarProps) {
  const params = useSearchParams();
  const activeUrl = params.get("url");
  const grouped = groupByLocale(items);

  return (
    <Sidebar>
      <SidebarHeader>
        <Link
          href="/"
          className="flex items-center gap-2 px-2 py-2 text-sm font-semibold tracking-tight"
        >
          <Globe className="text-primary size-4" />
          <span>{brand}</span>
        </Link>
        <Separator />
      </SidebarHeader>

      <SidebarContent>
        {items.length === 0 ? (
          <div className="text-muted-foreground p-4 text-xs">
            No URLs inspected yet. Use the form on the home page.
          </div>
        ) : (
          grouped.map(({ locale, entries }) => (
            <SidebarGroup key={locale}>
              <SidebarGroupLabel className="flex items-center gap-2">
                <Languages className="size-3.5" />
                {locale === "" ? "Unspecified" : locale}
                <span className="text-muted-foreground/60 ml-auto text-[10px] tabular-nums">
                  {entries.length}
                </span>
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {entries.map((item) => {
                    const isActive = item.url === activeUrl;
                    return (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton
                          isActive={isActive}
                          tooltip={item.url}
                          className={cn("flex h-auto flex-col items-start gap-0.5 py-2")}
                          render={
                            <Link
                              href={`/inspect?url=${encodeURIComponent(item.url)}`}
                              data-testid="sidebar-item"
                              data-url={item.url}
                            >
                              <span className="w-full truncate text-sm font-medium">
                                {item.title}
                              </span>
                              <span className="text-muted-foreground/80 flex w-full items-center gap-1 truncate font-mono text-[10px]">
                                <span className="truncate">{shortUrl(item.url)}</span>
                                {item.inspected ? (
                                  <Badge
                                    variant={item.status >= 400 ? "destructive" : "secondary"}
                                    className="ml-auto h-4 px-1 text-[9px] tabular-nums"
                                  >
                                    {item.status}
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="text-muted-foreground/60 ml-auto h-4 px-1 text-[9px] tracking-wide uppercase"
                                    title="Listed from the sitemap — not inspected yet"
                                  >
                                    sitemap
                                  </Badge>
                                )}
                                {item.extractor === "headless" ? (
                                  <Badge
                                    variant="outline"
                                    className="h-4 px-1 text-[9px] tracking-wide uppercase"
                                    title="Captured via headless Chromium"
                                  >
                                    JS
                                  </Badge>
                                ) : null}
                              </span>
                            </Link>
                          }
                        />
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))
        )}
      </SidebarContent>

      <SidebarFooter>
        <p className="text-muted-foreground/60 px-2 pb-2 text-[10px] leading-tight">
          Local cache · cleared on dev server restart.
        </p>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return url;
  }
}

function groupByLocale(items: InspectSidebarItem[]) {
  const groups = new Map<string, InspectSidebarItem[]>();
  for (const item of items) {
    const key = item.locale ?? "";
    const existing = groups.get(key);
    if (existing) existing.push(item);
    else groups.set(key, [item]);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => {
      if (a === "") return 1;
      if (b === "") return -1;
      return a.localeCompare(b);
    })
    .map(([locale, entries]) => ({ locale, entries }));
}
