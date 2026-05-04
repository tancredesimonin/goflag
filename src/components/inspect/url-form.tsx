"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { runInspect } from "@/app/actions/inspect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface UrlFormProps {
  /** Optional pre-filled URL (used by the inspect view's "Re-fetch" path). */
  defaultValue?: string;
  /** Submit button label. */
  submitLabel?: string;
  /** Optional className for the wrapper form. */
  className?: string;
  /**
   * Called immediately after a successful inspection completes. Defaults to
   * navigating to /inspect?url=…; pass a custom handler to wire up
   * "Re-fetch" or watch-mode flows that should stay on the same page.
   */
  onInspected?: (url: string) => void;
}

export function UrlForm({
  defaultValue = "",
  submitLabel = "Inspect",
  className,
  onInspected,
}: UrlFormProps) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    const url = value.trim();
    if (!url) {
      setError("Enter a URL to inspect.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await runInspect({ url });
      if (!result.ok) {
        setError(result.error.message);
        toast.error(result.error.message);
        return;
      }
      if (onInspected) onInspected(result.url);
      else router.push(`/inspect?url=${encodeURIComponent(result.url)}`);
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
          placeholder="https://localhost:3000 or https://example.com"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "url-form-error" : undefined}
          disabled={isPending}
          className="h-11 font-mono text-sm"
          data-testid="url-input"
        />
        <Button type="submit" size="lg" disabled={isPending} data-testid="inspect-submit">
          {isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Inspecting…
            </>
          ) : (
            <>
              {submitLabel} <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>
      {error ? (
        <p
          id="url-form-error"
          role="alert"
          className="text-destructive text-sm"
          data-testid="url-form-error"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}
