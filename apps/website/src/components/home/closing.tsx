import { ArrowRightIcon } from "lucide-react";
import NextLink from "next/link";
import { getTranslations } from "next-intl/server";

import { CopyCommand } from "@/components/site/copy-command";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/routing";
import { INSTALL } from "@/lib/constants";

/**
 * The last section of the landing page: the claim on the left, the command that
 * tries it on the right. The layout was a shadcn/studio CTA block, kept here in
 * full rather than behind a generic `<CTASection>` — the page has exactly one
 * closing section, and a wrapper with a `title`, a `lead` and a `children` slot
 * only moved four lines of markup one file away.
 */
export async function Closing() {
  const t = await getTranslations("home.close");
  const tHero = await getTranslations("home.hero");

  return (
    <section className="bg-primary py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <Card className="bg-primary rounded-none border-0 shadow-none">
          <CardContent
            className="flex justify-between gap-8 max-lg:flex-col md:px-8 lg:items-center"
            data-slot="cta-content"
          >
            <div className="max-w-xl space-y-4">
              <h2 className="text-primary-foreground text-3xl font-semibold text-balance md:text-4xl">
                {t("title")}
              </h2>
              {/* Not `text-muted-foreground`: on `bg-primary` that pairing
                  inverts and fails contrast in one of the two themes. */}
              <p className="text-primary-foreground/70 text-lg">{t("lead")}</p>
            </div>

            <div className="shrink-0">
              <div className="flex w-full flex-col gap-4 lg:w-[26rem]">
                <CopyCommand
                  command={INSTALL.tryIt}
                  copyLabel={tHero("copy")}
                  copiedLabel={tHero("copied")}
                />
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" asChild>
                    <NextLink href="/docs/quickstart">
                      {t("quickstart")}
                      <ArrowRightIcon />
                    </NextLink>
                  </Button>
                  <Button variant="secondary" asChild>
                    <Link href="/changelog">{t("changelog")}</Link>
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
