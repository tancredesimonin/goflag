"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Network } from "lucide-react";
import { toast } from "sonner";
import { loadSite } from "@/app/actions/site";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface SiteFormProps {
  defaultValue?: string;
  submitLabel?: string;
  className?: string;
}

/**
 * Base-URL entry for the site-navigation flow. Runs `loadSite` (sitemap
 * discovery) and navigates to `/site?url=…` on success. Sibling to
 * `UrlForm`, which inspects a single page.
 */
export function SiteForm({
  defaultValue = "",
  submitLabel = "Explore site",
  className,
}: SiteFormProps) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    const url = value.trim();
    if (!url) {
      setError("Enter a URL to explore.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await loadSite({ url });
      if (!result.ok) {
        setError(result.error.message);
        toast.error(result.error.message);
        return;
      }
      router.push(`/site?url=${encodeURIComponent(result.url)}`);
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
          type="text"
          name="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="example.com"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "site-form-error" : undefined}
          disabled={isPending}
          className="h-11 font-mono text-sm"
          data-testid="site-input"
        />
        <Button type="submit" size="lg" disabled={isPending} data-testid="site-submit">
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Exploring…
            </>
          ) : (
            <>
              <Network className="size-4" /> {submitLabel} <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>
      {error ? (
        <p
          id="site-form-error"
          role="alert"
          className="text-destructive text-sm"
          data-testid="site-form-error"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}
