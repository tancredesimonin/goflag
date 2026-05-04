import type { Page } from "@/lib/core/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { lint } from "@/lib/core/lint";
import { PageHeaderCard } from "./page-header-card";
import { annotateRawHead } from "./raw/annotations";
import { highlightHtml } from "@/lib/highlight";
import { RawHeadViewer } from "./raw/raw-head-viewer";
import { FaviconGrid } from "./assets/favicon-grid";
import { ManifestViewer } from "./assets/manifest-viewer";
import { RobotsViewer } from "./assets/robots-viewer";
import { PreviewsTab } from "./previews/previews-tab";
import { IssuesTab } from "./issues/issues-tab";
import { InspectTabs } from "./inspect-tabs";

export interface InspectViewProps {
  page: Page;
}

/**
 * Top-level inspect surface. Header card on top, six tabs below.
 *
 * Tab implementation status:
 *  - Previews: live (Phase 4 — 11 platform unfurls + "What if?" toggle)
 *  - Issues: live (Phase 5 — 25 rules, severity-grouped cards, jump-to-tag)
 *  - Raw: live (Phase 3.6 — shiki + hover annotations + jump anchors)
 *  - Assets: live (Phase 3.7 — favicons + manifest + robots.txt)
 *  - Structured data / i18n: stubs scaffolded for Phases 6–7.
 *
 * Lint runs on the server (it's a pure `Page → Issue[]` call), so no
 * client roundtrip is needed to render the Issues panel. The
 * `InspectTabs` client wrapper exists only to manage the active-tab
 * state needed for cross-tab "Jump to tag" navigation.
 */
export async function InspectView({ page }: InspectViewProps) {
  const annotated = annotateRawHead(page);
  const tags = await Promise.all(
    annotated.map(async (t) => ({ ...t, highlighted: await highlightHtml(t.html) })),
  );
  const issues = lint(page);

  return (
    <div className="flex flex-col gap-6">
      <PageHeaderCard page={page} />

      <InspectTabs
        defaultTab="raw"
        counts={{
          issues: issues.length,
          structured: page.jsonLd.length,
          i18n: page.links.alternates.length,
        }}
        panels={{
          previews: <PreviewsTab page={page} />,
          issues: <IssuesTab issues={issues} />,
          raw: <RawHeadViewer tags={tags} />,
          structured: (
            <StubTab
              title="Structured data"
              description={
                page.jsonLd.length > 0
                  ? `${page.jsonLd.length} JSON-LD block(s) detected. The schema-aware tree view lands in Phase 6.`
                  : "No JSON-LD blocks on this page. The suggestion engine in Phase 6 will recommend templates."
              }
              counter={page.jsonLd.length}
            />
          ),
          i18n: (
            <StubTab
              title="Internationalisation matrix"
              description={
                page.links.alternates.length > 0
                  ? `${page.links.alternates.length} hreflang alternates declared. The reciprocity matrix lands in Phase 7.`
                  : "No hreflang alternates on this page. The matrix renders once the crawler ships in Phase 7."
              }
              counter={page.links.alternates.length}
            />
          ),
          assets: (
            <>
              <section className="space-y-3" aria-labelledby="favicons-heading">
                <h3
                  id="favicons-heading"
                  className="text-muted-foreground/80 text-xs font-medium tracking-wider uppercase"
                >
                  Favicons ({page.links.icons.length})
                </h3>
                <FaviconGrid icons={page.links.icons} />
              </section>
              <section className="space-y-3" aria-labelledby="manifest-heading">
                <h3
                  id="manifest-heading"
                  className="text-muted-foreground/80 text-xs font-medium tracking-wider uppercase"
                >
                  Web app manifest
                </h3>
                <ManifestViewer probe={page.probes.manifest} />
              </section>
              <section className="space-y-3" aria-labelledby="robots-heading">
                <h3
                  id="robots-heading"
                  className="text-muted-foreground/80 text-xs font-medium tracking-wider uppercase"
                >
                  robots.txt
                </h3>
                <RobotsViewer probe={page.probes.robots} />
              </section>
            </>
          ),
        }}
      />
    </div>
  );
}

function StubTab({
  title,
  description,
  counter,
}: {
  title: string;
  description: string;
  counter?: number;
}) {
  return (
    <Card className="border-border/40 border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          {title}
          {counter !== undefined && counter > 0 ? (
            <span className="text-muted-foreground ml-2 text-xs tabular-nums">({counter})</span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">{description}</CardContent>
    </Card>
  );
}
