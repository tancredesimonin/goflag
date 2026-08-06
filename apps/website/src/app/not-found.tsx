import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { Button } from "@/components/ui/button";

/**
 * One 404 for both trees. It serves `/docs/nope` as well as `/fr/nope`, so the
 * header is rendered here rather than inherited from a locale layout.
 */
export default async function NotFound() {
  const t = await getTranslations("notFound");
  const locale = await getLocale();

  return (
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
  );
}
