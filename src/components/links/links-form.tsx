"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { runLinkAudit } from "@/app/actions/audit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface LinksFormProps {
  defaultValue?: string;
  submitLabel?: string;
  className?: string;
}

/**
 * Base-URL entry for the link-checker flow. Runs `runLinkAudit` (shared
 * discovery → link audit) and navigates to `/links?url=…` on success.
 * Sibling to `SiteForm` / `UrlForm`.
 */
export function LinksForm({
  defaultValue = "",
  submitLabel = "Check links",
  className,
}: LinksFormProps) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    const url = value.trim();
    if (!url) {
      setError("Enter a URL to check.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await runLinkAudit({ url });
      if (!result.ok) {
        setError(result.error.message);
        toast.error(result.error.message);
        return;
      }
      router.push(`/links?url=${encodeURIComponent(result.url)}`);
    });
  }

  return (
    <form
      className={cn("flex w-full flex-col gap-2", className)}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex w-full items-stretch gap-2">
        <Input
          type="url"
          name="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://example.com"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "links-form-error" : undefined}
          disabled={isPending}
          className="h-11 font-mono text-sm"
          data-testid="links-input"
        />
        <Button type="submit" size="lg" disabled={isPending} data-testid="links-submit">
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Checking…
            </>
          ) : (
            <>
              <Link2 className="size-4" /> {submitLabel} <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>
      {error ? (
        <p
          id="links-form-error"
          role="alert"
          className="text-destructive text-sm"
          data-testid="links-form-error"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}
