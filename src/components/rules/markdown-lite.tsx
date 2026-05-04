/**
 * Tiny markdown renderer used by `/rules/[id]` and the rule index page.
 *
 * The rules layer keeps documentation in plain markdown strings on
 * each rule's `docs.rationale` (and elsewhere). We don't want to ship
 * a full markdown engine just to render a few paragraphs of dev-doc
 * copy, so this file handles the four primitives we actually use:
 *
 *   - paragraphs (split on blank lines),
 *   - inline `code spans`,
 *   - inline [label](href) links (rendered as plain `<a>`),
 *   - bullet lists (lines starting with `- `, grouped consecutively).
 *
 * Anything fancier (headings, code fences, tables) is intentionally
 * out of scope. The rule rationale is small on purpose and consumers
 * who need richer output can extend this file.
 */

import { Fragment } from "react";

interface MarkdownLiteProps {
  source: string;
  className?: string;
}

function renderInline(text: string): string {
  // Escape angle brackets / ampersands first so source can mention raw
  // HTML safely (e.g. `<title>`).
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped
    .replace(/`([^`]+)`/g, '<code class="bg-muted rounded px-1 py-0.5 text-xs">$1</code>')
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a class="text-primary underline-offset-4 hover:underline" href="$2">$1</a>',
    )
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold">$1</strong>');
}

export function MarkdownLite({ source, className }: MarkdownLiteProps) {
  const blocks: Array<{ type: "p" | "ul"; lines: string[] }> = [];
  const paragraphs = source.trim().split(/\n\n+/);
  for (const para of paragraphs) {
    const lines = para.split("\n");
    const isList = lines.every((l) => l.trim().startsWith("- "));
    if (isList) {
      blocks.push({ type: "ul", lines: lines.map((l) => l.trim().replace(/^- /, "")) });
    } else {
      blocks.push({ type: "p", lines });
    }
  }

  return (
    <div className={`text-foreground/90 space-y-4 text-sm leading-relaxed ${className ?? ""}`}>
      {blocks.map((block, i) => (
        <Fragment key={i}>
          {block.type === "p" ? (
            <p
              dangerouslySetInnerHTML={{
                __html: renderInline(block.lines.join(" ")),
              }}
            />
          ) : (
            <ul className="list-disc space-y-1.5 pl-5">
              {block.lines.map((item, j) => (
                <li key={j} dangerouslySetInnerHTML={{ __html: renderInline(item) }} />
              ))}
            </ul>
          )}
        </Fragment>
      ))}
    </div>
  );
}
