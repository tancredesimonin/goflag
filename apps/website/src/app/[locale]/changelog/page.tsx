import { ExternalLinkIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ReleaseTimeline } from "@/components/changelog/release-timeline";
import { CopyCommand } from "@/components/site/copy-command";
import { Badge } from "@/components/ui/badge";
import {
  currentVersions,
  getChangelog,
  type ChangelogSectionId,
  type PackageId,
} from "@/lib/changelog";
import { LIB, PACKAGE } from "@/lib/constants";
import { requireLocale, routes } from "@/lib/seo/site";

// Breaking first. It is the one thing a reader has to act on, and it used to
// render last under "Other changes", which is the worst place for it.
const SECTION_ORDER: ChangelogSectionId[] = ["breaking", "features", "fixes", "docs", "other"];

/** What each package is called on npm, and where to send someone who wants it. */
const NAMES: Record<PackageId, { name: string; npm: string }> = {
  cli: { name: PACKAGE.name, npm: PACKAGE.npm },
  next: { name: LIB.name, npm: LIB.npm },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = requireLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "meta.changelog" });

  return routes.metadata({
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
  const current = currentVersions(releases);
  const currentCli = current.find((entry) => entry.package === "cli");

  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "long" });
  const formatDate = (date: string | null) => (date ? dateFormat.format(new Date(date)) : "");

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
      <header className="mb-12 max-w-3xl">
        <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          {t("title")}
        </h1>
        <p className="text-muted-foreground mt-4 text-lg leading-relaxed">{t("lead")}</p>

        {/* One card per package. They ship on their own version lines, so a
            single "current version" would have to pick one and be wrong about
            the other. */}
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {current.map(({ package: pkg, version }) => (
            <div key={pkg}>
              <p className="text-muted-foreground font-mono text-sm">{NAMES[pkg].name}</p>
              <p className="font-display text-2xl font-semibold">{version}</p>
              <a
                href={NAMES[pkg].npm}
                target="_blank"
                rel="noreferrer"
                className="text-link mt-2 inline-flex items-center gap-1.5 text-sm hover:underline"
              >
                {t("onNpm")}
                <ExternalLinkIcon className="size-3.5" />
              </a>
            </div>
          ))}
        </div>

        {/* The pinned command is the CLI's: it is the one you run against a
            site. Pinning the library is an edit to a package.json, not a
            command worth copying. */}
        {currentCli ? (
          <div className="mt-8">
            <p className="text-muted-foreground mb-2 text-sm">{t("installPinned")}</p>
            <CopyCommand
              command={`pnpm dlx ${PACKAGE.name}@${currentCli.version} https://example.com`}
              copyLabel={tHero("copy")}
              copiedLabel={tHero("copied")}
            />
          </div>
        ) : null}
      </header>

      <ReleaseTimeline
        releases={releases.map((release) => ({
          id: `${release.package}-${release.version}`,
          version: release.version,
          packageName: NAMES[release.package].name,
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
