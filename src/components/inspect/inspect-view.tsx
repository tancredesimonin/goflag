import type { Page } from "@/lib/core/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeaderCard } from "./page-header-card";
import { annotateRawHead } from "./raw/annotations";
import { highlightHtml } from "@/lib/highlight";
import { RawHeadViewer } from "./raw/raw-head-viewer";
import { FaviconGrid } from "./assets/favicon-grid";
import { ManifestViewer } from "./assets/manifest-viewer";
import { RobotsViewer } from "./assets/robots-viewer";
import { PreviewsTab } from "./previews/previews-tab";

export interface InspectViewProps {
  page: Page;
}

/**
 * Top-level inspect surface. Header card on top, six tabs below.
 *
 * Tab implementation status:
 *  - Previews: live (Phase 4 — 11 platform unfurls + "What if?" toggle)
 *  - Raw: live (Phase 3.6 — shiki + hover annotations)
 *  - Assets: live (Phase 3.7 — favicons + manifest + robots.txt)
 *  - Issues / Structured data / i18n: stubs scaffolded for Phases 5–7.
 *    They render an explanatory placeholder so the UI never looks broken.
 */
export async function InspectView({ page }: InspectViewProps) {
  const annotated = annotateRawHead(page);
  // Highlight every snippet in parallel — keeps the cold render under
  // ~50 ms even on a 100-tag head.
  const tags = await Promise.all(
    annotated.map(async (t) => ({ ...t, highlighted: await highlightHtml(t.html) })),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeaderCard page={page} />

      <Tabs defaultValue="raw" className="w-full">
        <TabsList className="bg-muted/40 grid w-full grid-cols-6">
          <TabsTrigger value="previews" data-testid="tab-previews">
            Previews
          </TabsTrigger>
          <TabsTrigger value="issues" data-testid="tab-issues">
            Issues
          </TabsTrigger>
          <TabsTrigger value="raw" data-testid="tab-raw">
            Raw
          </TabsTrigger>
          <TabsTrigger value="structured" data-testid="tab-structured">
            Structured data
          </TabsTrigger>
          <TabsTrigger value="i18n" data-testid="tab-i18n">
            i18n
          </TabsTrigger>
          <TabsTrigger value="assets" data-testid="tab-assets">
            Assets
          </TabsTrigger>
        </TabsList>

        <TabsContent value="previews" className="mt-4">
          <PreviewsTab page={page} />
        </TabsContent>
        <TabsContent value="issues" className="mt-4">
          <StubTab
            title="Issues"
            description="Severity-grouped lint findings with copy-pasteable fixes and jump-to-anchor. Lands in Phase 5."
            counter={page.jsonLd.length === 0 ? 1 : 0}
          />
        </TabsContent>
        <TabsContent value="raw" className="mt-4">
          <RawHeadViewer tags={tags} />
        </TabsContent>
        <TabsContent value="structured" className="mt-4">
          <StubTab
            title="Structured data"
            description={
              page.jsonLd.length > 0
                ? `${page.jsonLd.length} JSON-LD block(s) detected. The schema-aware tree view lands in Phase 6.`
                : "No JSON-LD blocks on this page. The suggestion engine in Phase 6 will recommend templates."
            }
            counter={page.jsonLd.length}
          />
        </TabsContent>
        <TabsContent value="i18n" className="mt-4">
          <StubTab
            title="Internationalisation matrix"
            description={
              page.links.alternates.length > 0
                ? `${page.links.alternates.length} hreflang alternates declared. The reciprocity matrix lands in Phase 7.`
                : "No hreflang alternates on this page. The matrix renders once the crawler ships in Phase 7."
            }
            counter={page.links.alternates.length}
          />
        </TabsContent>
        <TabsContent value="assets" className="mt-4 space-y-6">
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
        </TabsContent>
      </Tabs>
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
