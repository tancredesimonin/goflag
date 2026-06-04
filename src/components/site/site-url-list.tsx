"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2, Search } from "lucide-react";
import type { SitemapUrlEntry } from "@/lib/core/sitemap/types";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Minimal per-entry reachability annotation (a subset of LinkCheck). */
export interface UrlStatus {
  verdict: "ok" | "redirect" | "broken" | "blocked" | "warning" | "skipped";
  status: number;
}

export interface SiteUrlListProps {
  /** All page URLs discovered for the site. */
  urls: SitemapUrlEntry[];
  /** URLs already inspected this session (rendered with a "done" marker). */
  inspectedUrls?: string[];
  /** Optional per-entry reachability status, keyed by URL. */
  statuses?: Record<string, UrlStatus>;
}

interface UrlRow extends SitemapUrlEntry {
  pathname: string;
  inspected: boolean;
  status?: UrlStatus;
}

const STATUS_CLASS: Record<UrlStatus["verdict"], string> = {
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  redirect: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  broken: "border-destructive/30 bg-destructive/10 text-destructive",
  blocked: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  warning: "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  skipped: "border-border bg-muted/40 text-muted-foreground",
};

/**
 * Searchable, grouped list of every page in the sitemap. Each row links
 * to `/inspect?url=…` so the user can drill into any page's head/meta —
 * the core "navigate the whole site, not just the root" use-case.
 */
export function SiteUrlList({ urls, inspectedUrls = [], statuses }: SiteUrlListProps) {
  const [query, setQuery] = useState("");
  const inspectedSet = useMemo(() => new Set(inspectedUrls), [inspectedUrls]);

  const rows = useMemo<UrlRow[]>(() => {
    return urls.map((entry) => ({
      ...entry,
      pathname: pathnameOf(entry.loc),
      inspected: inspectedSet.has(entry.loc),
      status: statuses?.[entry.loc],
    }));
  }, [urls, inspectedSet, statuses]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.loc.toLowerCase().includes(q));
  }, [rows, query]);

  const groups = useMemo(() => groupBySection(filtered), [filtered]);

  return (
    <div className="flex flex-col gap-4" data-testid="site-url-list">
      <div className="relative">
        <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Filter ${urls.length} URLs…`}
          className="h-10 pl-9 font-mono text-sm"
          data-testid="site-url-filter"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">No URLs match “{query}”.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(({ section, entries }) => (
            <section key={section} className="flex flex-col gap-1.5">
              <h3 className="text-muted-foreground/70 flex items-center gap-2 text-[11px] font-medium tracking-wider uppercase">
                {section}
                <span className="tabular-nums">{entries.length}</span>
              </h3>
              <ul className="flex flex-col gap-1">
                {entries.map((row) => (
                  <li key={row.loc}>
                    <Link
                      href={`/inspect?url=${encodeURIComponent(row.loc)}`}
                      data-testid="site-url-item"
                      data-url={row.loc}
                      className={cn(
                        "group border-border/40 hover:bg-muted/50 flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                      )}
                    >
                      {row.inspected ? (
                        <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
                      ) : (
                        <span className="bg-muted-foreground/30 size-1.5 shrink-0 rounded-full" />
                      )}
                      <span className="truncate font-mono text-xs">{row.pathname}</span>
                      <div className="ml-auto flex shrink-0 items-center gap-2">
                        {row.status ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              "h-5 px-1.5 text-[10px] font-medium uppercase",
                              STATUS_CLASS[row.status.verdict],
                            )}
                            data-testid="site-url-status"
                            data-verdict={row.status.verdict}
                            title={`Reachability: ${row.status.verdict} (${row.status.status || "error"})`}
                          >
                            {row.status.verdict}
                          </Badge>
                        ) : null}
                        {row.lastmod ? (
                          <Badge variant="outline" className="h-5 px-1.5 text-[10px] tabular-nums">
                            {formatDate(row.lastmod)}
                          </Badge>
                        ) : null}
                        <ArrowUpRight className="text-muted-foreground/0 group-hover:text-muted-foreground size-3.5 transition-colors" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function pathnameOf(loc: string): string {
  try {
    const u = new URL(loc);
    return `${u.pathname}${u.search}` || "/";
  } catch {
    return loc;
  }
}

/** First path segment, e.g. `/blog/post` -> `blog`; root -> `/`. */
function sectionOf(pathname: string): string {
  const seg = pathname.split("/").filter(Boolean)[0];
  return seg ? `/${seg}` : "/";
}

function groupBySection(rows: UrlRow[]): Array<{ section: string; entries: UrlRow[] }> {
  const map = new Map<string, UrlRow[]>();
  for (const row of rows) {
    const key = sectionOf(row.pathname);
    const existing = map.get(key);
    if (existing) existing.push(row);
    else map.set(key, [row]);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => {
      if (a === "/") return -1;
      if (b === "/") return 1;
      return a.localeCompare(b);
    })
    .map(([section, entries]) => ({ section, entries }));
}

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString().slice(0, 10);
}
