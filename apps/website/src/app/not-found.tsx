import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";

import { HtmlLang } from "@/components/site/html-lang";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { Button } from "@/components/ui/button";
import { requireLocale, site } from "@/lib/seo/site";

/**
 * One 404 for both trees. It serves `/docs/nope` as well as `/fr/nope`, so the
 * header is rendered here rather than inherited from a locale layout.
 *
 * The same goes for the intl provider: this page renders at the root, under
 * neither `[locale]/layout` nor `docs/layout`, and the header and footer it
 * draws hold client components that read the locale. `getLocale()` resolves
 * the segment of the missing URL — `fr` for `/fr/nope`, `en` for `/docs/nope` —
 * and the prop-less provider hands that on.
 */
export default async function NotFound() {
  const t = await getTranslations("notFound");
  const locale = await getLocale();

  return (
    <NextIntlClientProvider>
      <HtmlLang lang={site.lang(requireLocale(locale))} />
      <div className="flex min-h-dvh flex-col">
        <SiteHeader localized={false} />

        <main
          id="main"
          className="mx-auto flex max-w-2xl grow flex-col justify-center px-4 py-24 sm:px-6"
        >
          <p className="font-display text-flag-red text-6xl font-semibold">{t("title")}</p>
          <p className="mt-6 text-lg leading-relaxed">{t("lead")}</p>

          <div className="mt-8">
            <Button asChild>
              <Link href={`/${locale}`}>{t("home")}</Link>
            </Button>
          </div>

          <p className="text-muted-foreground mt-12 border-l-2 pl-4 text-sm leading-relaxed">
            {t("irony")}
          </p>
        </main>

        <SiteFooter />
      </div>
    </NextIntlClientProvider>
  );
}
