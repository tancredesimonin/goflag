import type { ReactNode } from "react";

/**
 * The rule registry writes inline code with backticks, because its messages are
 * printed in a terminal. Rendering them verbatim on a web page would show the
 * backticks; `stripBackticks` in the CLI drops them entirely. Here they become
 * what they meant.
 */
export function Ticks({ children }: { children: string }): ReactNode {
  return children.split("`").map((part, index) =>
    index % 2 === 1 ? (
      <code key={index} className="bg-muted rounded px-1.5 py-0.5 font-mono text-[0.875em]">
        {part}
      </code>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

/** The same transformation for a plain string, when JSX is not wanted. */
export function stripTicks(text: string): string {
  return text.replace(/`/g, "");
}
