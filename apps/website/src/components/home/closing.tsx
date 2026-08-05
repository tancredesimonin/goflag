import { ArrowRightIcon } from "lucide-react";
import NextLink from "next/link";
import { getTranslations } from "next-intl/server";

import CTASection from "@/components/shadcn-studio/blocks/cta-section-10/cta-section-10";
import { CopyCommand } from "@/components/site/copy-command";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";
import { INSTALL } from "@/lib/constants";

export async function Closing() {
  const t = await getTranslations("home.close");
  const tHero = await getTranslations("home.hero");

  return (
    <CTASection title={t("title")} lead={t("lead")}>
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
    </CTASection>
  );
}
