import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";

import { HtmlLang } from "@/components/site/html-lang";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { routing } from "@/i18n/routing";
import { site } from "@/lib/seo/site";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * The client provider lives here, in the segment that carries the locale, and
 * not in the root layout above it.
 *
 * Next renders the root layout once per page load. A client-side navigation
 * from `/fr` to `/en` re-renders this layout — its `[locale]` param changed —
 * and leaves the root layout as it was, with whatever a provider placed there
 * had been handed on the first page: `locale="fr"` and the French messages.
 * Every client hook under it then kept answering `fr` on an English page. The
 * language switcher ticked Français on `/en`, and because `usePathname` strips
 * the prefix it believes in, it saw `/en` as an unprefixed path and sent
 * a reader who asked for French to `/fr/en`, a 404.
 *
 * Here the provider is re-created with the segment, so what it hands the
 * client is always the locale of the page being shown. It takes no props:
 * `setRequestLocale` above it is what lets `locale` and `messages` be inherited
 * from the request configuration during a static render.
 *
 * `<html lang>` has the same problem and no segment-level answer, since only
 * the root layout renders that element: `HtmlLang` corrects it from the client.
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return (
    <NextIntlClientProvider>
      <HtmlLang lang={site.lang(locale)} />
      <div className="flex min-h-dvh flex-col">
        <SiteHeader />
        {/* `editorial` is what puts the serif on headings — see globals.css. It is
            scoped to the localized tree on purpose: the documentation lives
            outside it and stays in Inter, where a reader is scanning for a flag
            name rather than reading prose. */}
        <main id="main" className="editorial grow">
          {children}
        </main>
        <SiteFooter />
      </div>
    </NextIntlClientProvider>
  );
}
