"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Compact, type-aware tree view for parsed JSON-LD blocks.
 *
 * Distinguishing features (vs. dumping JSON to a `<pre>`):
 *
 *   - Every object node renders a `@type` badge inline so the user can
 *     scan an `@graph` at a glance ("Article, then BreadcrumbList,
 *     then Organization") without expanding each entity.
 *   - Arrays/objects are collapsed by default past the second level —
 *     keeps the tab readable for `@graph`-heavy pages while still
 *     letting the user drill in.
 *   - Validation errors emitted by `validateJsonLdBlock` get attached
 *     to the matching node by path and rendered as a red ring around
 *     the node header (Phase 6.3 inline-error treatment). The path is
 *     also surfaced as a `data-path` attribute so the Phase 9 diff
 *     viewer can highlight added/removed nodes.
 */

import type { JsonLdValidationIssue } from "@/lib/structured/types";

export interface JsonTreeProps {
  value: unknown;
  /** Validation issues for this entire block; we filter by `path` per node. */
  issues?: JsonLdValidationIssue[];
  /** Default-collapsed past this depth (root = 0). */
  initiallyCollapsedAt?: number;
}

export function JsonTree({ value, issues = [], initiallyCollapsedAt = 2 }: JsonTreeProps) {
  return (
    <div className="font-mono text-xs leading-relaxed" data-testid="json-tree">
      <Node
        value={value}
        path=""
        depth={0}
        issues={issues}
        initiallyCollapsedAt={initiallyCollapsedAt}
      />
    </div>
  );
}

interface NodeProps {
  value: unknown;
  path: string;
  depth: number;
  issues: JsonLdValidationIssue[];
  initiallyCollapsedAt: number;
}

function Node({ value, path, depth, issues, initiallyCollapsedAt }: NodeProps) {
  const matching = issues.filter((i) => i.path === path);
  const hasError = matching.some((i) => i.severity === "error");
  const hasWarning = matching.some((i) => i.severity === "warning");

  if (value === null)
    return <Leaf raw="null" tone="text-sky-600 dark:text-sky-400" matching={matching} />;
  if (value === undefined)
    return <Leaf raw="undefined" tone="text-muted-foreground" matching={matching} />;
  if (typeof value === "string")
    return (
      <Leaf
        raw={JSON.stringify(value)}
        tone="text-emerald-600 dark:text-emerald-400"
        matching={matching}
      />
    );
  if (typeof value === "number")
    return (
      <Leaf raw={String(value)} tone="text-amber-600 dark:text-amber-400" matching={matching} />
    );
  if (typeof value === "boolean")
    return <Leaf raw={String(value)} tone="text-sky-600 dark:text-sky-400" matching={matching} />;

  if (Array.isArray(value)) {
    return (
      <Collapsible
        label={`Array(${value.length})`}
        depth={depth}
        path={path}
        initiallyCollapsedAt={initiallyCollapsedAt}
        hasError={hasError}
        hasWarning={hasWarning}
        matching={matching}
      >
        <ul className="border-border/40 ml-4 border-l pl-3">
          {value.map((item, i) => (
            <li key={i} className="py-0.5" data-testid="json-tree-item">
              <span className="text-muted-foreground/60 mr-1.5">[{i}]</span>
              <Node
                value={item}
                path={`${path}[${i}]`}
                depth={depth + 1}
                issues={issues}
                initiallyCollapsedAt={initiallyCollapsedAt}
              />
            </li>
          ))}
        </ul>
      </Collapsible>
    );
  }

  // Object
  const obj = value as Record<string, unknown>;
  const type = readType(obj);
  const entries = Object.entries(obj).filter(([k]) => k !== "@graph");
  const graph = obj["@graph"];
  const summary = type ? `{} ${type}` : `{}`;

  return (
    <Collapsible
      label={summary}
      depth={depth}
      path={path}
      initiallyCollapsedAt={initiallyCollapsedAt}
      hasError={hasError}
      hasWarning={hasWarning}
      matching={matching}
      typeBadge={type}
    >
      <ul className="border-border/40 ml-4 border-l pl-3">
        {entries.map(([key, child]) => (
          <li key={key} className="py-0.5" data-testid="json-tree-property" data-key={key}>
            <span className="text-foreground/80 mr-1.5">&quot;{key}&quot;:</span>
            <Node
              value={child}
              path={joinPath(path, key)}
              depth={depth + 1}
              issues={issues}
              initiallyCollapsedAt={initiallyCollapsedAt}
            />
          </li>
        ))}
        {Array.isArray(graph) ? (
          <li className="py-0.5">
            <span className="text-foreground/80 mr-1.5">&quot;@graph&quot;:</span>
            <Node
              value={graph}
              path={joinPath(path, "@graph")}
              depth={depth + 1}
              issues={issues}
              initiallyCollapsedAt={initiallyCollapsedAt}
            />
          </li>
        ) : null}
      </ul>
    </Collapsible>
  );
}

interface CollapsibleProps {
  label: string;
  typeBadge?: string;
  depth: number;
  path: string;
  initiallyCollapsedAt: number;
  hasError: boolean;
  hasWarning: boolean;
  matching: JsonLdValidationIssue[];
  children: React.ReactNode;
}

function Collapsible({
  label,
  typeBadge,
  depth,
  path,
  initiallyCollapsedAt,
  hasError,
  hasWarning,
  matching,
  children,
}: CollapsibleProps) {
  const [open, setOpen] = useState(depth < initiallyCollapsedAt);
  return (
    <div data-path={path || "$"} data-testid="json-tree-node">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "hover:bg-muted/40 inline-flex items-center gap-1 rounded px-1 py-0.5 text-left transition-colors",
          hasError && "ring-destructive/50 ring-1",
          hasWarning && !hasError && "ring-1 ring-amber-400/50",
        )}
        aria-expanded={open}
        data-testid="json-tree-toggle"
      >
        {open ? (
          <ChevronDown className="text-muted-foreground size-3.5" />
        ) : (
          <ChevronRight className="text-muted-foreground size-3.5" />
        )}
        <span className="text-muted-foreground/80">{label}</span>
        {typeBadge ? (
          <Badge variant="outline" className="ml-1 text-[10px]" data-testid="json-tree-type-badge">
            {typeBadge}
          </Badge>
        ) : null}
      </button>
      {matching.length > 0 ? (
        <ul className="ml-5 list-disc space-y-0.5 pl-4 text-[11px]" data-testid="json-tree-issues">
          {matching.map((issue, i) => (
            <li
              key={i}
              className={cn(
                issue.severity === "error" && "text-destructive",
                issue.severity === "warning" && "text-amber-600 dark:text-amber-400",
                issue.severity === "info" && "text-sky-600 dark:text-sky-400",
              )}
              data-severity={issue.severity}
              data-code={issue.code}
            >
              {issue.message}
            </li>
          ))}
        </ul>
      ) : null}
      {open ? children : null}
    </div>
  );
}

function Leaf({
  raw,
  tone,
  matching = [],
}: {
  raw: string;
  tone: string;
  matching?: JsonLdValidationIssue[];
}) {
  if (matching.length === 0) return <span className={tone}>{raw}</span>;
  return (
    <span className="inline-flex flex-col gap-0.5 align-top">
      <span className={tone}>{raw}</span>
      <ul className="list-disc pl-4 text-[11px]" data-testid="json-tree-issues">
        {matching.map((issue, i) => (
          <li
            key={i}
            className={cn(
              issue.severity === "error" && "text-destructive",
              issue.severity === "warning" && "text-amber-600 dark:text-amber-400",
              issue.severity === "info" && "text-sky-600 dark:text-sky-400",
            )}
            data-severity={issue.severity}
            data-code={issue.code}
          >
            {issue.message}
          </li>
        ))}
      </ul>
    </span>
  );
}

function readType(obj: Record<string, unknown>): string | undefined {
  const t = obj["@type"];
  if (typeof t === "string") return t;
  if (Array.isArray(t)) return t.filter((v): v is string => typeof v === "string").join(", ");
  return undefined;
}

function joinPath(parent: string, key: string): string {
  return parent ? `${parent}.${key}` : key;
}
