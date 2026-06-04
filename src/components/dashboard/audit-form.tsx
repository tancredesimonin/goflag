"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { runFullAudit } from "@/app/actions/audit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface AuditFormProps {
  defaultValue?: string;
  className?: string;
}

/**
 * The unified entry: one base URL runs the shared discovery and (by
 * default) the link audit, then lands on the dashboard. "Enter the base
 * URL once → the app fans out."
 */
export function AuditForm({ defaultValue = "", className }: AuditFormProps) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const [links, setLinks] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    const url = value.trim();
    if (!url) {
      setError("Enter a URL to audit.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await runFullAudit({ url, links });
      if (!result.ok) {
        setError(result.error.message);
        toast.error(result.error.message);
        return;
      }
      router.push(`/dashboard?url=${encodeURIComponent(result.url)}`);
    });
  }

  return (
    <form
      className={cn("flex w-full flex-col gap-3", className)}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex w-full items-stretch gap-2">
        <Input
          type="text"
          name="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="example.com"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "audit-form-error" : undefined}
          disabled={isPending}
          className="h-11 font-mono text-sm"
          data-testid="audit-input"
        />
        <Button type="submit" size="lg" disabled={isPending} data-testid="audit-submit">
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Auditing…
            </>
          ) : (
            <>
              <ScanSearch className="size-4" /> Audit site <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>

      <label className="text-muted-foreground flex w-fit items-center gap-2 text-xs select-none">
        <input
          type="checkbox"
          checked={links}
          onChange={(e) => setLinks(e.target.checked)}
          disabled={isPending}
          data-testid="audit-links-toggle"
          className="accent-primary size-3.5"
        />
        Check links now (scrapes every page — slower on large sites)
      </label>

      {error ? (
        <p
          id="audit-form-error"
          role="alert"
          className="text-destructive text-sm"
          data-testid="audit-form-error"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}
