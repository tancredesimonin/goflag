import Link from "next/link";
import { Suspense } from "react";
import { FileText, Link2, Map as MapIcon } from "lucide-react";
import { discoverSitemap } from "@/lib/core/sitemap/discover";
import type { SiteDiscovery } from "@/lib/core/sitemap/types";
import { getSite, setSite } from "@/lib/store/site-store";
import { getLinkAudit } from "@/lib/store/link-audit-store";
import { listCachedPages } from "@/lib/store/inspect-cache";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AuditForm } from "@/components/dashboard/audit-form";
import { InspectSkeleton } from "@/components/inspect/inspect-skeleton";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface DashboardPageProps {
  searchParams: Promise<{ url?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const url = params.url?.trim();

  if (!url) {
    return (
      <section className="flex flex-col gap-4" aria-labelledby="dash-heading">
        <div className="flex flex-col gap-1">
          <h1 id="dash-heading" className="text-lg font-semibold tracking-tight">
            Audit a site
          </h1>
          <p className="text-muted-foreground text-sm">
            Enter a base URL once. Goflag discovers the site, then runs three audits over it —
            sitemap health, head/meta quality, and link integrity.
          </p>
        </div>
        <AuditForm />
      </section>
    );
  }

  return (
    <Suspense fallback={<InspectSkeleton />}>
      <DashboardAsync url={url} />
    </Suspense>
  );
}

async function DashboardAsync({ url }: { url: string }) {
  let discovery: SiteDiscovery | undefined = getSite(url);
  if (!discovery) {
    discovery = await discoverSitemap(url);
    setSite(discovery);
  }

  const linkAudit = getLinkAudit(url);
  const inspected = listCachedPages().filter((p) => sameOrigin(p.url, discovery!.origin));
  const headIssues = inspected.length;
  const firstPage = discovery.urls[0]?.loc ?? url;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight">{hostOf(discovery.baseUrl)}</h1>
        <p className="text-muted-foreground text-sm">
          One base URL, three lenses. Open any audit for the full report.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <DashCard
          href={`/site?url=${encodeURIComponent(url)}`}
          icon={<MapIcon className="size-4" />}
          title="Sitemap"
          testid="dash-card-sitemap"
          stat={`${discovery.urls.length}`}
          statLabel="pages discovered"
          badges={[
            discovery.diagnostics.found ? "sitemap found" : "no sitemap",
            `via ${discovery.source}`,
          ]}
        />

        <DashCard
          href={`/inspect?url=${encodeURIComponent(firstPage)}`}
          icon={<FileText className="size-4" />}
          title="Head"
          testid="dash-card-head"
          stat={`${headIssues}`}
          statLabel={headIssues === 1 ? "page inspected" : "pages inspected"}
          badges={headIssues === 0 ? ["lazy — inspect on open"] : ["cached"]}
        />

        <DashCard
          href={`/links?url=${encodeURIComponent(url)}`}
          icon={<Link2 className="size-4" />}
          title="Links"
          testid="dash-card-links"
          stat={linkAudit ? `${linkAudit.summary.broken}` : "—"}
          statLabel={linkAudit ? "broken links" : "not run yet"}
          tone={linkAudit && linkAudit.summary.broken > 0 ? "danger" : "default"}
          badges={
            linkAudit
              ? [
                  `${Object.keys(linkAudit.checks).length} checked`,
                  `${linkAudit.pagesScanned} scanned`,
                ]
              : ["run the link audit"]
          }
        />
      </div>
    </div>
  );
}

interface DashCardProps {
  href: string;
  icon: React.ReactNode;
  title: string;
  testid: string;
  stat: string;
  statLabel: string;
  badges: string[];
  tone?: "default" | "danger";
}

function DashCard({ href, icon, title, testid, stat, statLabel, badges, tone }: DashCardProps) {
  return (
    <Link href={href} data-testid={testid} className="group">
      <Card className="border-border/60 hover:border-border h-full transition-colors">
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <span className="text-muted-foreground group-hover:text-foreground transition-colors">
            {icon}
          </span>
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "font-mono text-2xl font-semibold tabular-nums",
                tone === "danger" ? "text-destructive" : "text-foreground",
              )}
            >
              {stat}
            </span>
            <span className="text-muted-foreground text-xs">{statLabel}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {badges.map((b) => (
              <Badge key={b} variant="outline" className="text-[10px]">
                {b}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </Link>
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
