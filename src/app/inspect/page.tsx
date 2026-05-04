import { redirect } from "next/navigation";
import { Suspense } from "react";
import { inspect, type InspectMode } from "@/lib/core/inspect";
import { FetchError } from "@/lib/core/fetch/static";
import { HeadlessUnavailableError } from "@/lib/core/extract/headless";
import { getCachedPage, setCachedPage } from "@/lib/store/inspect-cache";
import { InspectView } from "@/components/inspect/inspect-view";
import { InspectError } from "@/components/inspect/inspect-error";
import { InspectSkeleton } from "@/components/inspect/inspect-skeleton";

export const dynamic = "force-dynamic";

interface InspectPageProps {
  searchParams: Promise<{ url?: string; mode?: string }>;
}

export default async function InspectPage({ searchParams }: InspectPageProps) {
  const params = await searchParams;
  const url = params.url?.trim();
  if (!url) redirect("/");

  return (
    <Suspense fallback={<InspectSkeleton />}>
      <InspectAsync url={url} mode={params.mode} />
    </Suspense>
  );
}

async function InspectAsync({ url, mode }: { url: string; mode?: string }) {
  let page = getCachedPage(url);
  if (!page) {
    try {
      page = await inspect(url, { mode: normalizeMode(mode) });
      setCachedPage(url, page);
    } catch (err) {
      const message =
        err instanceof HeadlessUnavailableError
          ? `${err.message} Re-run with ?mode=static to use the static extractor.`
          : err instanceof FetchError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);
      return <InspectError url={url} message={message} />;
    }
  }
  return <InspectView page={page} />;
}

function normalizeMode(raw?: string): InspectMode {
  if (raw === "static" || raw === "headless" || raw === "auto") return raw;
  return "auto";
}
