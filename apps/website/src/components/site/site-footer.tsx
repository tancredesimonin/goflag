import { PackageIcon } from "lucide-react";
import NextLink from "next/link";
import { getTranslations } from "next-intl/server";

import GithubIcon from "@/assets/svg/github-icon";
import { LocaleSwitcherSelect } from "@/components/site/locale-switcher";
import { Logo } from "@/components/site/logo";
import { ThemeToggleSelect } from "@/components/site/theme-toggle";
import { Separator } from "@/components/ui/separator";
import { Link } from "@/i18n/routing";
import { PACKAGE, SITE } from "@/lib/constants";

export async function SiteFooter() {
  const t = await getTranslations("footer");

  const links = [
    { label: t("docs"), href: "/docs", localized: false },
    { label: t("quickstart"), href: "/docs/quickstart", localized: false },
    { label: t("rules"), href: "/docs/rules", localized: false },
    { label: t("ci"), href: "/docs/ci", localized: false },
    { label: t("changelog"), href: "/changelog", localized: true },
    { label: t("legalNotice"), href: "/legal-notice", localized: true },
    { label: t("privacy"), href: "/privacy-policy", localized: true },
    { label: t("cookies"), href: "/cookies", localized: true },
  ];

  return (
    <footer className="border-t">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-8 lg:flex-row lg:justify-between">
          <div className="flex flex-col items-center gap-2 lg:items-start">
            <Logo />
            <p className="text-muted-foreground max-w-xs text-center text-sm lg:text-start">
              {t("tagline")}
            </p>
          </div>

          <nav className="text-muted-foreground flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm">
            {links.map((item) =>
              item.localized ? (
                <Link
                  key={item.href}
                  href={item.href}
                  className="hover:text-foreground transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <NextLink
                  key={item.href}
                  href={item.href}
                  className="hover:text-foreground transition-colors"
                >
                  {item.label}
                </NextLink>
              ),
            )}
          </nav>

          <div className="text-muted-foreground flex items-center gap-4">
            {PACKAGE.repoPublic ? (
              <a
                href={PACKAGE.repo}
                target="_blank"
                rel="noreferrer"
                aria-label={t("github")}
                className="hover:text-foreground transition-colors"
              >
                <GithubIcon className="size-5" />
              </a>
            ) : null}
            <a
              href={PACKAGE.npm}
              target="_blank"
              rel="noreferrer"
              aria-label={t("npm")}
              className="hover:text-foreground transition-colors"
            >
              <PackageIcon className="size-5" />
            </a>
          </div>
        </div>

        <Separator className="my-8" />

        <div className="text-muted-foreground flex flex-col items-center gap-4 text-sm sm:flex-row sm:justify-between">
          <p>
            {t("copyright", { year: new Date().getFullYear(), domain: SITE.domain })}
            <span className="text-muted-foreground/60 mx-2">·</span>
            {t("packageLicense", { name: PACKAGE.name })}
          </p>
          <div className="flex flex-col items-center gap-3 sm:items-end">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <LocaleSwitcherSelect />
              <ThemeToggleSelect />
            </div>
            <p className="text-center sm:text-end">{t("issuesNote")}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
