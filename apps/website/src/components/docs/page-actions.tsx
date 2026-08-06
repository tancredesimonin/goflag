"use client";

import { CheckIcon, CopyIcon, FileTextIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Copy as markdown" and "view raw" — for readers who are feeding the page to a
 * model rather than reading it. Cheaper than a chat widget and impossible to get
 * out of date, since both come from the same source the page was rendered from.
 */
export function PageActions({
  markdown,
  rawPath,
  className,
}: {
  markdown: string;
  rawPath: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timeout.current), []);

  async function copy() {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button variant="outline" size="sm" onClick={copy}>
        {copied ? <CheckIcon className="text-flag-green" /> : <CopyIcon />}
        {copied ? "Copied" : "Copy as markdown"}
      </Button>
      <Button variant="ghost" size="sm" asChild>
        <a href={rawPath}>
          <FileTextIcon />
          View raw
        </a>
      </Button>
    </div>
  );
}
