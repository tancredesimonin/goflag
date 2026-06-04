import { Suspense } from "react";
import { discoverSitemap } from "@/lib/core/sitemap/discover";
import type { SiteDiscovery } from "@/lib/core/sitemap/types";
import { analyzeSitemapHealth } from "@/lib/core/sitemap/analyze";
import { getSite, setSite } from "@/lib/store/site-store";
import { getLinkAudit } from "@/lib/store/link-audit-store";
import { listCachedPages } from "@/lib/store/inspect-cache";
import { SitemapAnalysis } from "@/components/site/sitemap-analysis";
import { SitemapHealthChecklist } from "@/components/site/sitemap-health";
import { SiteUrlList, type UrlStatus } from "@/components/site/site-url-list";
import { SiteForm } from "@/components/site/site-form";
import { InspectSkeleton } from "@/components/inspect/inspect-skeleton";

export const dynamic = "force-dynamic";

interface SitePageProps {
  searchParams: Promise<{ url?: string }>;
}

export default async function SitePage({ searchParams }: SitePageProps) {
  const params = await searchParams;
  const url = params.url?.trim();

  if (!url) {
    return (
      <section className="flex flex-col gap-4" aria-labelledby="explore-heading">
        <div className="flex flex-col gap-1">
          <h1 id="explore-heading" className="text-lg font-semibold tracking-tight">
            Explore a site
          </h1>
          <p className="text-muted-foreground text-sm">
            Enter a base URL. Headlint finds the sitemap (or crawls), then lists every page so you
            can inspect its <code>&lt;head&gt;</code> — not just the homepage.
          </p>
        </div>
        <SiteForm />
      </section>
    );
  }

  return (
    <Suspense fallback={<InspectSkeleton />}>
      <SiteAsync url={url} />
    </Suspense>
  );
}

async function SiteAsync({ url }: { url: string }) {
  let discovery: SiteDiscovery | undefined = getSite(url);
  if (!discovery) {
    discovery = await discoverSitemap(url);
    setSite(discovery);
  }

  const inspectedUrls = listCachedPages()
    .map((p) => p.url)
    .filter((u) => sameOrigin(u, discovery!.origin));

  // Reuse a prior link audit (same origin) to surface orphan pages without
  // re-scanning. The reachability probe runs here as part of the audit.
  const linkAudit = getLinkAudit(discovery.baseUrl);
  const linkedInternalUrls = linkAudit
    ? linkAudit.occurrences.filter((o) => o.ref.kind === "internal").map((o) => o.ref.url)
    : [];

  const health =
    discovery.urls.length > 0
      ? await analyzeSitemapHealth(discovery, { linkedInternalUrls })
      : undefined;

  const statuses: Record<string, UrlStatus> | undefined = health
    ? Object.fromEntries(
        Object.entries(health.checks).map(([url, check]) => [
          url,
          { verdict: check.verdict, status: check.status },
        ]),
      )
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight">
          {hostOf(discovery.baseUrl)}
          <span className="text-muted-foreground ml-2 text-sm font-normal tabular-nums">
            {discovery.urls.length} pages
          </span>
        </h1>
        <p className="text-muted-foreground text-sm">
          Pick any page to inspect its head and social previews.
        </p>
      </div>

      <SitemapAnalysis discovery={discovery} />

      {health ? <SitemapHealthChecklist health={health} /> : null}

      {discovery.urls.length > 0 ? (
        <SiteUrlList urls={discovery.urls} inspectedUrls={inspectedUrls} statuses={statuses} />
      ) : (
        <p className="text-muted-foreground py-8 text-center text-sm">
          No pages were found for this site. Try a different base URL.
        </p>
      )}
    </div>
  );
}

function sameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
