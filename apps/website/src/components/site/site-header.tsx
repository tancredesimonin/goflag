import { MenuIcon } from "lucide-react";
import NextLink from "next/link";
import { getTranslations } from "next-intl/server";

import GithubIcon from "@/assets/svg/github-icon";
import { LocaleSwitcher } from "@/components/site/locale-switcher";
import { Logo } from "@/components/site/logo";
import { ThemeToggle } from "@/components/site/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@/i18n/routing";
import { PACKAGE } from "@/lib/constants";

/**
 * `localized` is false on `/docs`, which lives outside the locale segment.
 * Offering a language switcher there would navigate to `/fr/docs`, a route that
 * does not exist — and should not, while the documentation is English only.
 */
export async function SiteHeader({ localized = true }: { localized?: boolean }) {
  const t = await getTranslations("nav");

  // `/docs` is outside the locale segment (English-only), so it is linked with
  // the plain router rather than the localized one.
  const items = [
    { title: t("docs"), href: "/docs", localized: false },
    { title: t("rules"), href: "/docs/rules", localized: false },
    { title: t("changelog"), href: "/changelog", localized: true },
  ];

  return (
    <header className="bg-background/80 sticky top-0 z-50 border-b backdrop-blur-md">
      <a
        href="#main"
        className="bg-background focus:ring-ring sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:px-4 focus:py-2 focus:ring-2"
      >
        {t("skipToContent")}
      </a>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="hover:text-foreground/80 transition-colors">
          <Logo />
        </Link>

        <nav className="text-muted-foreground flex items-center gap-7 text-sm font-medium max-md:hidden">
          {items.map((item) =>
            item.localized ? (
              <Link
                key={item.href}
                href={item.href}
                className="hover:text-foreground transition-colors"
              >
                {item.title}
              </Link>
            ) : (
              <NextLink
                key={item.href}
                href={item.href}
                className="hover:text-foreground transition-colors"
              >
                {item.title}
              </NextLink>
            ),
          )}
        </nav>

        <div className="flex items-center gap-1">
          {PACKAGE.repoPublic ? (
            <Button variant="ghost" size="icon" asChild>
              <a href={PACKAGE.repo} target="_blank" rel="noreferrer" aria-label={t("github")}>
                <GithubIcon className="size-4.5" />
              </a>
            </Button>
          ) : null}
          <ThemeToggle label={t("toggleTheme")} />
          {localized ? <LocaleSwitcher label={t("language")} /> : null}

          <DropdownMenu>
            <DropdownMenuTrigger className="md:hidden" asChild>
              <Button variant="ghost" size="icon" aria-label={t("openMenu")}>
                <MenuIcon className="size-4.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {items.map((item) => (
                <DropdownMenuItem key={item.href} asChild>
                  {item.localized ? (
                    <Link href={item.href}>{item.title}</Link>
                  ) : (
                    <NextLink href={item.href}>{item.title}</NextLink>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
