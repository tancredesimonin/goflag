"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { acceptSnapshot } from "@/app/actions/snapshot";

export interface AcceptChangesButtonProps {
  url: string;
  /**
   * Label override. Defaults to "Accept changes" for the diff state and
   * "Save snapshot" for the empty state.
   */
  label?: string;
  /** Visual emphasis. Diff state uses default; empty state uses outline. */
  variant?: "default" | "outline";
}

/**
 * Client wrapper around `acceptSnapshot`. Disabled while the action is
 * pending so a double-click never triggers two parallel writes against
 * the same file (the writer is atomic, but a flicker between the two
 * renders is still confusing).
 */
export function AcceptChangesButton({
  url,
  label = "Accept changes",
  variant = "default",
}: AcceptChangesButtonProps) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  const onClick = () => {
    setDone(false);
    startTransition(async () => {
      const result = await acceptSnapshot({ url });
      if (result.ok) {
        setDone(true);
        toast.success(`Snapshot for ${result.route} written.`);
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <Button onClick={onClick} disabled={pending} variant={variant} data-testid="accept-snapshot">
      {pending ? "Writing…" : done ? "Saved" : label}
    </Button>
  );
}
