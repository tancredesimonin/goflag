"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CopyCommandProps {
  command: string;
  copyLabel: string;
  copiedLabel: string;
  className?: string;
}

export function CopyCommand({ command, copyLabel, copiedLabel, className }: CopyCommandProps) {
  const [copied, setCopied] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timeout.current), []);

  async function copy() {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className={cn(
        "border-terminal-border bg-terminal text-terminal-foreground flex items-center gap-3 rounded-lg border py-2.5 pr-2 pl-4",
        className,
      )}
    >
      <span className="text-terminal-dim select-none font-mono text-sm" aria-hidden="true">
        $
      </span>
      {/* `min-w-0`, or `overflow-x-auto` never engages: a flex item will not
          shrink below its content, so on a 375px phone the hero's command was
          384px wide and its `overflow-hidden` cut off the copy button. The
          scrollbar is hidden: where scrollbars are not overlays it drew a grey
          strip under the command, and the button copies all of it anyway. */}
      <code className="min-w-0 grow overflow-x-auto font-mono text-sm whitespace-nowrap [scrollbar-width:none]">
        {command}
      </code>
      <Button
        variant="ghost"
        size="icon"
        onClick={copy}
        aria-label={copied ? copiedLabel : copyLabel}
        className="text-terminal-dim hover:text-terminal-foreground hover:bg-terminal-border/60 size-8 shrink-0"
      >
        {copied ? (
          <CheckIcon className="text-flag-green size-4" />
        ) : (
          <CopyIcon className="size-4" />
        )}
      </Button>
    </div>
  );
}
