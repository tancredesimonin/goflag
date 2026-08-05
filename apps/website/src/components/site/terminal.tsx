import { cn } from "@/lib/utils";
import type { Span, TerminalLine } from "@/lib/terminal-samples";

/**
 * The terminal keeps its own palette, deliberately. These are the colours goflag
 * actually prints, so they answer to the CLI rather than to the site theme — the
 * point of the panel is that it is the real output. They also do not flip with
 * the theme, because the panel behind them does not: the page-level `--flag-*`
 * are shades chosen for a white background.
 */
const TONE_CLASS = {
  dim: "text-terminal-dim",
  bold: "text-terminal-foreground font-semibold",
  red: "text-terminal-red",
  yellow: "text-terminal-yellow",
  green: "text-terminal-green",
  cyan: "text-terminal-cyan",
} as const;

function Line({ spans }: { spans: TerminalLine }) {
  if (spans.length === 0) return <span>{"\n"}</span>;

  return (
    <span>
      {spans.map((span: Span, index) =>
        typeof span === "string" ? (
          <span key={index}>{span}</span>
        ) : (
          <span key={index} className={TONE_CLASS[span.tone]}>
            {span.t}
          </span>
        ),
      )}
      {"\n"}
    </span>
  );
}

interface TerminalProps {
  command?: string;
  lines: readonly TerminalLine[];
  className?: string;
  label?: string;
}

export function Terminal({ command, lines, className, label }: TerminalProps) {
  return (
    <div
      className={cn(
        "border-terminal-border bg-terminal overflow-hidden rounded-xl border shadow-2xl shadow-black/20",
        className,
      )}
    >
      <div className="border-terminal-border flex items-center gap-2 border-b px-4 py-3">
        <span className="bg-terminal-red/70 size-3 rounded-full" />
        <span className="bg-terminal-yellow/70 size-3 rounded-full" />
        <span className="bg-terminal-green/70 size-3 rounded-full" />
        {label ? (
          <span className="text-terminal-dim ml-2 font-mono text-xs tracking-wide">{label}</span>
        ) : null}
      </div>

      <div className="overflow-x-auto px-4 py-4 sm:px-5">
        {command ? (
          <p className="text-terminal-foreground mb-3 font-mono text-[13px] leading-relaxed whitespace-pre">
            <span className="text-terminal-dim select-none">$ </span>
            {command}
          </p>
        ) : null}
        <pre className="text-terminal-foreground font-mono text-[13px] leading-relaxed">
          <code>
            {lines.map((spans, index) => (
              <Line key={index} spans={spans} />
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}
