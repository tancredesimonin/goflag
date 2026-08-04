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
      <code className="grow overflow-x-auto font-mono text-sm whitespace-nowrap">{command}</code>
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
