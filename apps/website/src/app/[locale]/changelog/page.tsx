import { ExternalLinkIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import ChangelogContent from "@/components/shadcn-studio/blocks/timeline-component-05/timeline-component-05";
import { CopyCommand } from "@/components/site/copy-command";
import { Badge } from "@/components/ui/badge";
import { getChangelog, type ChangelogSectionId } from "@/lib/changelog";
import { PACKAGE } from "@/lib/constants";
import { buildPageMetadata } from "@/lib/seo/metadata";

const SECTION_ORDER: ChangelogSectionId[] = ["features", "fixes", "docs", "other"];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta.changelog" });

  return buildPageMetadata({
    locale,
    path: "/changelog",
    title: t("title"),
    description: t("description"),
  });
}

export default async function ChangelogPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("changelog");
  const tHero = await getTranslations("home.hero");
  const releases = getChangelog();
  const latest = releases[0];

  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "long" });
  const formatDate = (date: string | null) => (date ? dateFormat.format(new Date(date)) : "");

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
      <header className="mb-12 max-w-3xl">
        <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          {t("title")}
        </h1>
        <p className="text-muted-foreground mt-4 text-lg leading-relaxed">
          {t("lead", { package: PACKAGE.name })}
        </p>

        {latest ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
            <div>
              <p className="text-muted-foreground text-sm">{t("currentVersion")}</p>
              <p className="font-display text-2xl font-semibold">{latest.version}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-2 text-sm">{t("installPinned")}</p>
              <CopyCommand
                command={`npx --yes "${PACKAGE.name}@${latest.version}" https://example.com`}
                copyLabel={tHero("copy")}
                copiedLabel={tHero("copied")}
              />
            </div>
          </div>
        ) : null}

        <a
          href={PACKAGE.npm}
          target="_blank"
          rel="noreferrer"
          className="text-link mt-6 inline-flex items-center gap-1.5 text-sm hover:underline"
        >
          {t("onNpm")}
          <ExternalLinkIcon className="size-3.5" />
        </a>
      </header>

      <ChangelogContent
        releases={releases.map((release) => ({
          version: release.version,
          date: formatDate(release.date),
          content: (
            <div className="space-y-6">
              {release.note ? (
                <p className="text-muted-foreground leading-relaxed">{release.note}</p>
              ) : null}

              {SECTION_ORDER.filter((id) =>
                release.sections.some((section) => section.id === id),
              ).map((id) => {
                const section = release.sections.find((candidate) => candidate.id === id);
                if (!section) return null;

                return (
                  <section key={id}>
                    <h2 className="mb-3 text-sm font-semibold tracking-wide uppercase">
                      {t(`sections.${id}`)}
                    </h2>
                    <ul className="space-y-2">
                      {section.entries.map((entry) => (
                        <li
                          key={`${entry.sha ?? ""}${entry.subject}`}
                          className="flex flex-wrap items-baseline gap-2"
                        >
                          {entry.scope ? (
                            <Badge
                              variant="outline"
                              className="font-mono text-[0.6875rem] font-normal"
                            >
                              {entry.scope}
                            </Badge>
                          ) : null}
                          <span className="text-[0.9375rem]">{entry.subject}</span>
                          {/* The SHA is worth printing either way — it is how you
                              find the commit once you have the repository. It is
                              only a link when the repository answers. */}
                          {entry.sha ? (
                            entry.commitUrl && PACKAGE.repoPublic ? (
                              <a
                                href={entry.commitUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-muted-foreground hover:text-link font-mono text-xs transition-colors"
                                aria-label={`${t("viewCommit")} ${entry.sha}`}
                              >
                                {entry.sha.slice(0, 7)}
                              </a>
                            ) : (
                              <span className="text-muted-foreground font-mono text-xs">
                                {entry.sha.slice(0, 7)}
                              </span>
                            )
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}

              {release.compareUrl && PACKAGE.repoPublic ? (
                <a
                  href={release.compareUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-link inline-flex items-center gap-1.5 text-sm transition-colors"
                >
                  {t("viewDiff")}
                  <ExternalLinkIcon className="size-3.5" />
                </a>
              ) : null}
            </div>
          ),
        }))}
      />
    </div>
  );
}
