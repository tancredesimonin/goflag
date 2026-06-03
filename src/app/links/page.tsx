import { Suspense } from "react";
import { discoverSitemap } from "@/lib/core/sitemap/discover";
import { runLinkAudit } from "@/lib/core/links/audit";
import type { LinkAuditReport } from "@/lib/core/links/types";
import { buildLinkRows, listHosts } from "@/lib/core/links/report";
import { getSite, setSite } from "@/lib/store/site-store";
import { getLinkAudit, setLinkAudit } from "@/lib/store/link-audit-store";
import { LinkAuditSummary } from "@/components/links/link-audit-summary";
import { BrokenLinksTable } from "@/components/links/broken-links-table";
import { LinksForm } from "@/components/links/links-form";
import { InspectSkeleton } from "@/components/inspect/inspect-skeleton";

export const dynamic = "force-dynamic";

interface LinksPageProps {
  searchParams: Promise<{ url?: string }>;
}

export default async function LinksPage({ searchParams }: LinksPageProps) {
  const params = await searchParams;
  const url = params.url?.trim();

  if (!url) {
    return (
      <section className="flex flex-col gap-4" aria-labelledby="links-heading">
        <div className="flex flex-col gap-1">
          <h1 id="links-heading" className="text-lg font-semibold tracking-tight">
            Check a site&apos;s links
          </h1>
          <p className="text-muted-foreground text-sm">
            Enter a base URL. Headlint discovers every page, scrapes their links, and probes each
            unique target once — finding broken internal and external links across the whole site.
          </p>
        </div>
        <LinksForm />
      </section>
    );
  }

  return (
    <Suspense fallback={<InspectSkeleton />}>
      <LinksAsync url={url} />
    </Suspense>
  );
}

async function LinksAsync({ url }: { url: string }) {
  let report: LinkAuditReport | undefined = getLinkAudit(url);
  if (!report) {
    let discovery = getSite(url);
    if (!discovery) {
      discovery = await discoverSitemap(url);
      setSite(discovery);
    }
    report = await runLinkAudit(discovery);
    setLinkAudit(report);
  }

  const rows = buildLinkRows(report);
  const hosts = listHosts(report);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight">
          {hostOf(report.baseUrl)}
          <span className="text-muted-foreground ml-2 text-sm font-normal tabular-nums">
            {report.summary.broken} broken
          </span>
        </h1>
        <p className="text-muted-foreground text-sm">
          Every unique link is probed once, then mapped back to the pages that reference it.
        </p>
      </div>

      <LinkAuditSummary report={report} />

      {Object.keys(report.checks).length > 0 ? (
        <BrokenLinksTable rows={rows} hosts={hosts} />
      ) : (
        <p className="text-muted-foreground py-8 text-center text-sm">
          No links were found on this site.
        </p>
      )}
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
