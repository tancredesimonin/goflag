import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

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
  );
}
