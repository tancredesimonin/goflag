import type { Issue, Page } from "@/lib/core/types";
import { lint } from "@/lib/core/lint";
import { applyFrameworkSnippets, applyRuleConfig, loadConfig } from "@/lib/config";
import { suggest } from "@/lib/suggestions";
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
import { StructuredTab } from "./structured/structured-tab";
import { SuggestionCard } from "./structured/suggestion-card";
import type { Suggestion } from "@/lib/structured/types";
import { I18nTab } from "./i18n/i18n-tab";

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
  // Apply the project's `headlint.config.ts` if one is present. Loader
  // failures fall back to the empty default config — surfacing them
  // in the UI is left to a future Settings panel.
  const configResult = await loadConfig();
  const config = configResult.ok ? configResult.config : undefined;
  const baseIssues = applyFrameworkSnippets(applyRuleConfig(lint(page), config), config?.framework);
  const suggestions = suggest(page);
  const suggestionIssues: Issue[] = suggestions.map(suggestionToIssue);
  const issues = [...baseIssues, ...suggestionIssues];

  // Highlight suggestion snippets in parallel — same trick the Raw tab
  // uses, keeps server time bounded by the slowest snippet.
  const suggestionViews = await Promise.all(
    suggestions.map(async (s) => ({
      suggestion: s,
      highlighted: await highlightHtml(s.example.snippet, { lang: s.example.language }),
    })),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeaderCard page={page} />

      <InspectTabs
        defaultTab="raw"
        counts={{
          issues: issues.length,
          structured: page.jsonLd.length + suggestions.length,
          i18n: page.links.alternates.length,
        }}
        panels={{
          previews: <PreviewsTab page={page} />,
          issues: <IssuesTab issues={issues} />,
          raw: <RawHeadViewer tags={tags} />,
          structured: (
            <div className="space-y-6">
              <StructuredTab blocks={page.jsonLd} />
              {suggestionViews.length > 0 ? (
                <section className="space-y-3" aria-labelledby="suggestions-heading">
                  <h3
                    id="suggestions-heading"
                    className="text-muted-foreground/80 text-xs font-medium tracking-wider uppercase"
                  >
                    Suggestions ({suggestionViews.length})
                  </h3>
                  <div className="space-y-3">
                    {suggestionViews.map(({ suggestion, highlighted }) => (
                      <SuggestionCard
                        key={suggestion.id}
                        suggestion={suggestion}
                        highlighted={highlighted}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          ),
          i18n: <I18nTab page={page} />,
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

/**
 * Mirror a Phase 6 `Suggestion` into the Phase 5 `Issue` shape so it
 * appears as a low-noise "info" entry in the Issues panel without
 * needing its own panel section.
 */
function suggestionToIssue(s: Suggestion): Issue {
  return {
    ruleId: `suggestion.${s.id}`,
    severity: "info",
    message: s.title,
    fix: { title: `Add a ${s.type} JSON-LD block`, snippet: s.example.snippet, language: "json" },
    docs: "/rules#suggestions",
  };
}
