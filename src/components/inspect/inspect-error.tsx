"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UrlForm } from "@/components/inspect/url-form";

export interface InspectErrorProps {
  url: string;
  message: string;
}

/**
 * Failure surface for the inspect view — fires a toast (matches PLAN 3.10),
 * shows a re-runnable URL form so the user can edit and retry without
 * losing context.
 */
export function InspectError({ url, message }: InspectErrorProps) {
  useEffect(() => {
    toast.error(`Failed to inspect ${url}`, { description: message });
  }, [url, message]);

  return (
    <Card className="border-destructive/40 bg-destructive/5" data-testid="inspect-error">
      <CardHeader className="flex flex-row items-center gap-2 pb-2">
        <AlertTriangle className="text-destructive size-4" />
        <CardTitle className="text-sm font-medium">Inspection failed</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-foreground/80 text-sm">
          <code className="text-xs">{url}</code>
        </p>
        <p className="text-muted-foreground text-sm" data-testid="inspect-error-message">
          {message}
        </p>
        <UrlForm defaultValue={url} submitLabel="Try again" />
      </CardContent>
    </Card>
  );
}
