import { PackageIcon } from "lucide-react";
import NextLink from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import GithubIcon from "@/assets/svg/github-icon";
import { LocaleSwitcherSelect } from "@/components/site/locale-switcher";
import { Logo } from "@/components/site/logo";
import { ThemeToggleSelect } from "@/components/site/theme-toggle";
import { Separator } from "@/components/ui/separator";
import { Link } from "@/i18n/routing";
import { PACKAGE, SITE } from "@/lib/constants";

type FooterLink = {
  label: string;
  href: string;
  /** Through the locale-aware router, or Next's plain one for `/docs`. */
  localized?: boolean;
  /** Off-site, opened in a new tab. */
  external?: boolean;
  icon?: ReactNode;
};

// `items-start` with the icon nudged down, not `items-center`: a label that
// wraps on a phone keeps its icon on the first line instead of floating
// between two.
const LINK_CLASS =
  "hover:text-foreground inline-flex items-start gap-2 transition-colors duration-300";

function FooterAnchor({ link }: { link: FooterLink }) {
  const body = (
    <>
      {link.icon}
      {link.label}
    </>
  );

  if (link.external) {
    return (
      <a href={link.href} target="_blank" rel="noreferrer" className={LINK_CLASS}>
        {body}
      </a>
    );
  }

  // `/docs` is outside the locale segment (English-only), so it is linked with
  // the plain router rather than the localized one — same as the header.
  return link.localized ? (
    <Link href={link.href} className={LINK_CLASS}>
      {body}
    </Link>
  ) : (
    <NextLink href={link.href} className={LINK_CLASS}>
      {body}
    </NextLink>
  );
}

function FooterColumn({ heading, links }: { heading: string; links: FooterLink[] }) {
  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-lg font-medium">{heading}</h2>
      <ul className="text-muted-foreground space-y-3">
        {links.map((link) => (
          <li key={link.href}>
            <FooterAnchor link={link} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Laid out after shadcn/studio's tenth footer block: a rounded panel, the
 * wordmark drawn large across the top, the brand on the left and the links in
 * titled columns on the right. The block's newsletter form and partner logos
 * have no counterpart here and are left out.
 *
 * Three columns rather than the nine links in a row the footer used to wrap
 * across two lines in no order a reader could guess. Each column answers one
 * question — where the documentation is, where the project lives, what the
 * site owes a visitor — and the package link says what it is, `@goflag/cli on
 * npm`, rather than hiding behind a parcel icon.
 */
export async function SiteFooter() {
  const t = await getTranslations("footer");

  const product: FooterLink[] = [
    { label: t("docs"), href: "/docs" },
    { label: t("quickstart"), href: "/docs/quickstart" },
    { label: t("rules"), href: "/docs/rules" },
    { label: t("ci"), href: "/docs/ci" },
    { label: t("library"), href: "/docs/next" },
  ];

  const project: FooterLink[] = [
    { label: t("changelog"), href: "/changelog", localized: true },
    {
      label: t("npm", { name: PACKAGE.name }),
      href: PACKAGE.npm,
      external: true,
      icon: <PackageIcon className="mt-1 size-4 shrink-0" aria-hidden="true" />,
    },
    ...(PACKAGE.repoPublic
      ? [
          {
            label: t("github"),
            href: PACKAGE.repo,
            external: true,
            icon: <GithubIcon className="mt-1 size-4 shrink-0" aria-hidden="true" />,
          },
        ]
      : []),
  ];

  const legal: FooterLink[] = [
    { label: t("legalNotice"), href: "/legal-notice", localized: true },
    { label: t("privacy"), href: "/privacy-policy", localized: true },
    { label: t("cookies"), href: "/cookies", localized: true },
  ];

  return (
    <footer className="p-4 sm:p-6">
      {/* The panel reads as inset on both themes: a shade below the page in
          light, the card shade above it in dark — `bg-background` there would
          vanish into the page. */}
      <div className="bg-muted/50 dark:bg-card rounded-4xl py-8 sm:py-16">
        <div className="mx-auto flex max-w-7xl flex-col gap-16 px-4 sm:px-6 lg:px-8">
          {/* Decoration, as in the block: the wordmark at a size no heading
              would be, barely above the panel. Hidden from readers and from
              narrow screens, where it would only push the links down. */}
          <p
            aria-hidden="true"
            className="font-display text-foreground/[0.06] -mb-4 text-center text-[clamp(6rem,16vw,13rem)] leading-none font-semibold tracking-tighter select-none max-md:hidden"
          >
            {SITE.name}
          </p>

          <div className="grid grid-cols-6 gap-10 lg:gap-6">
            <div className="col-span-full flex flex-col items-start gap-4 lg:col-span-2">
              <Link href="/" className="hover:text-foreground/80 transition-colors">
                <Logo />
              </Link>
              <p className="text-muted-foreground max-w-sm">{t("tagline")}</p>
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <LocaleSwitcherSelect />
                <ThemeToggleSelect />
              </div>
            </div>

            <nav
              aria-label={t("product")}
              className="col-span-full grid grid-cols-2 gap-10 sm:grid-cols-3 lg:col-span-4 lg:gap-8"
            >
              <FooterColumn heading={t("product")} links={product} />
              <FooterColumn heading={t("project")} links={project} />
              <FooterColumn heading={t("legal")} links={legal} />
            </nav>
          </div>

          <div>
            <Separator className="mb-8" />
            <p className="text-muted-foreground text-sm">
              {t("copyright", { year: new Date().getFullYear(), domain: SITE.domain })}
              <span className="text-muted-foreground/60 mx-2">·</span>
              {t("packageLicense", { name: PACKAGE.name })}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
