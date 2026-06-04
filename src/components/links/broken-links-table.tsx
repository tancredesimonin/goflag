"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import type { LinkRow } from "@/lib/core/links/report";
import type { LinkKind, LinkVerdict } from "@/lib/core/links/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LinkVerdictBadge, VERDICT_META, VERDICT_ORDER } from "./link-verdict-badge";

export interface BrokenLinksTableProps {
  rows: LinkRow[];
  hosts: string[];
}

type KindFilter = "all" | LinkKind;

/** Verdicts shown by default — the ones a user needs to act on. */
const DEFAULT_VERDICTS: LinkVerdict[] = ["broken", "blocked", "warning"];

/**
 * The primary link-audit view: a filterable table of checked links with
 * their verdict, status/reason, redirect chain, and a collapsible list of
 * the pages that reference them.
 */
export function BrokenLinksTable({ rows, hosts }: BrokenLinksTableProps) {
  const [verdicts, setVerdicts] = useState<Set<LinkVerdict>>(
    () => new Set(DEFAULT_VERDICTS.filter((v) => rows.some((r) => r.check.verdict === v))),
  );
  const [kind, setKind] = useState<KindFilter>("all");
  const [host, setHost] = useState<string>("all");

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        if (verdicts.size > 0 && !verdicts.has(row.check.verdict)) return false;
        if (kind !== "all" && row.kind !== kind) return false;
        if (host !== "all" && row.host !== host) return false;
        return true;
      }),
    [rows, verdicts, kind, host],
  );

  function toggleVerdict(v: LinkVerdict) {
    setVerdicts((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }

  const presentVerdicts = VERDICT_ORDER.filter((v) => rows.some((r) => r.check.verdict === v));

  return (
    <div className="flex flex-col gap-3" data-testid="broken-links-table">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by verdict">
          {presentVerdicts.map((v) => {
            const active = verdicts.has(v);
            return (
              <button
                key={v}
                type="button"
                onClick={() => toggleVerdict(v)}
                aria-pressed={active}
                data-testid="verdict-filter"
                data-verdict={v}
                data-active={active}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs transition-colors",
                  active ? VERDICT_META[v].className : "border-border/60 text-muted-foreground",
                )}
              >
                {VERDICT_META[v].label}
              </button>
            );
          })}
        </div>

        <div className="bg-border h-5 w-px" aria-hidden />

        <div className="flex gap-1" role="group" aria-label="Filter by scope">
          {(["all", "internal", "external"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              data-testid="kind-filter"
              data-kind={k}
              className={cn(
                "rounded-md border px-2 py-1 text-xs capitalize transition-colors",
                kind === k
                  ? "border-foreground/30 bg-muted text-foreground"
                  : "border-border/60 text-muted-foreground",
              )}
            >
              {k}
            </button>
          ))}
        </div>

        {hosts.length > 1 ? (
          <select
            value={host}
            onChange={(e) => setHost(e.target.value)}
            data-testid="host-filter"
            className="border-border/60 bg-background h-7 rounded-md border px-2 text-xs"
            aria-label="Filter by host"
          >
            <option value="all">All hosts</option>
            {hosts.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        ) : null}

        <span className="text-muted-foreground ml-auto text-xs tabular-nums">
          {filtered.length} shown
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm" data-testid="links-empty">
          No links match the current filters.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {filtered.map((row) => (
            <LinkRowItem key={row.check.url} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}

function LinkRowItem({ row }: { row: LinkRow }) {
  const [open, setOpen] = useState(false);
  const { check } = row;
  const status = check.status === 0 ? "ERR" : String(check.status);

  return (
    <li
      className="border-border/40 rounded-md border"
      data-testid="link-row"
      data-verdict={check.verdict}
      data-kind={row.kind}
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <LinkVerdictBadge verdict={check.verdict} />
        <Badge variant="outline" className="h-5 px-1 font-mono text-[10px] tabular-nums">
          {status}
        </Badge>
        <a
          href={check.url}
          target="_blank"
          rel="noreferrer noopener"
          className="hover:text-foreground inline-flex min-w-0 items-center gap-1 font-mono text-xs"
          data-testid="link-target"
        >
          <span className="truncate">{check.url}</span>
          <ExternalLink className="size-3 shrink-0 opacity-60" />
        </a>
        <Badge
          variant="outline"
          className="text-muted-foreground h-5 px-1 text-[10px] uppercase"
          title={row.kind === "internal" ? "Same origin" : "Off-site link"}
        >
          {row.kind}
        </Badge>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1 text-xs"
          aria-expanded={open}
          data-testid="toggle-sources"
        >
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          {row.sources.length} page{row.sources.length === 1 ? "" : "s"}
        </button>
      </div>

      {check.reason || check.redirectChain.length > 0 ? (
        <div className="text-muted-foreground border-border/40 flex flex-wrap gap-x-4 gap-y-1 border-t px-3 py-1.5 text-[11px]">
          {check.reason ? (
            <span data-testid="link-reason">
              Reason: <span className="text-foreground/80">{check.reason}</span>
            </span>
          ) : null}
          <span>via {check.method}</span>
          {check.redirectChain.length > 0 ? (
            <span className="truncate">→ {check.redirectChain.join(" → ")}</span>
          ) : null}
        </div>
      ) : null}

      {open ? (
        <ul
          className="border-border/40 flex flex-col gap-1 border-t px-3 py-2"
          data-testid="source-pages"
        >
          {row.sources.map((s) => (
            <li key={s.pageUrl} className="flex items-center gap-2 text-xs">
              <a
                href={`/inspect?url=${encodeURIComponent(s.pageUrl)}`}
                className="text-muted-foreground hover:text-foreground truncate font-mono"
              >
                {pathOf(s.pageUrl)}
              </a>
              {s.anchorText ? (
                <span className="text-muted-foreground/70 truncate italic">“{s.anchorText}”</span>
              ) : null}
              {s.rel.includes("nofollow") ? (
                <Badge variant="outline" className="h-4 px-1 text-[9px]">
                  nofollow
                </Badge>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}` || "/";
  } catch {
    return url;
  }
}
