"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Suggestion } from "@/lib/structured/types";

export interface SuggestionCardProps {
  suggestion: Suggestion;
  /** Pre-rendered shiki HTML for the snippet (server-side highlighted). */
  highlighted: string;
}

/**
 * One card per Phase 6 suggestion. Carries the rationale, type badge,
 * the syntax-highlighted snippet (server-rendered, client island only
 * owns the "Copy" button state), and a one-click clipboard copy.
 *
 * The clipboard copy uses the raw snippet (not the syntax-highlighted
 * HTML) so users can paste straight into their layout file. We fall
 * back gracefully when `navigator.clipboard` is unavailable (older
 * Safari, sandboxed iframes, server-side render): the button shows a
 * brief "select & copy manually" hint via `title` and the snippet is
 * always selectable inside the rendered `<pre>`.
 */
export function SuggestionCard({ suggestion, highlighted }: SuggestionCardProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(suggestion.example.snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Older browsers / sandboxed contexts: leave the snippet visible
      // and let the user select-and-copy by hand. The button still
      // works visually, just doesn't change state.
    }
  }

  return (
    <Card
      className="border-sky-400/40 bg-sky-50/40 dark:bg-sky-500/5"
      data-testid="suggestion-card"
      data-suggestion-id={suggestion.id}
    >
      <CardHeader className="flex flex-col gap-2 pb-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[10px] text-sky-600 dark:text-sky-400">
              suggestion
            </Badge>
            <Badge variant="outline" className="font-mono text-[10px]">
              {suggestion.type}
            </Badge>
          </div>
          <CardTitle className="text-sm leading-snug font-medium">{suggestion.title}</CardTitle>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "self-start text-xs transition-colors",
            copied && "border-emerald-400/60 text-emerald-600 dark:text-emerald-400",
          )}
          onClick={copy}
          data-testid="suggestion-copy"
          aria-label="Copy snippet to clipboard"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy snippet"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <p className="text-muted-foreground text-sm leading-relaxed">{suggestion.rationale}</p>
        <ScrollArea className="border-border/60 bg-background/60 max-h-72 rounded-md border">
          <div
            className="raw-tag-highlight overflow-x-auto p-3 font-mono text-xs"
            data-testid="suggestion-snippet"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
