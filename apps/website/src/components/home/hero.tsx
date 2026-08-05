import { ArrowRightIcon } from "lucide-react";
import NextLink from "next/link";
import { getTranslations } from "next-intl/server";

import { CopyCommand } from "@/components/site/copy-command";
import { Terminal } from "@/components/site/terminal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { INSTALL, PACKAGE, PROOF } from "@/lib/constants";
import { HERO_REPORT } from "@/lib/terminal-samples";

/**
 * Deliberately not animated.
 *
 * A staggered entrance means the served HTML carries `opacity: 0` on the
 * headline, so the first thing a reader gets without JavaScript is a blank
 * screen. On a tool that reports what crawlers actually see, that would be an
 * odd thing to ship. The reveal animations start below the fold, where the
 * content is off-screen anyway.
 */
export async function Hero() {
  const t = await getTranslations("home.hero");

  return (
    <section className="relative overflow-hidden border-b">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />

      <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col items-start gap-6">
            <Badge
              variant="outline"
              className="text-muted-foreground font-mono text-xs font-normal"
            >
              {t("eyebrow", { node: PACKAGE.nodeRange })}
            </Badge>

            <h1 className="max-w-xl text-4xl font-semibold text-balance sm:text-5xl lg:text-[3.4rem] lg:leading-[1.08]">
              {t("title")}
            </h1>

            <p className="text-muted-foreground max-w-xl text-lg leading-relaxed">{t("lead")}</p>

            <div className="w-full max-w-xl">
              <p className="text-muted-foreground mb-2 text-sm font-medium">{t("commandLabel")}</p>
              <CopyCommand
                command={INSTALL.tryIt}
                copyLabel={t("copy")}
                copiedLabel={t("copied")}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" asChild>
                <NextLink href="/docs/quickstart">
                  {t("docsCta")}
                  <ArrowRightIcon />
                </NextLink>
              </Button>
              <Button size="lg" variant="ghost" asChild>
                <NextLink href="/docs/rules">
                  {t("rulesCta", { count: PROOF.pageRules + PROOF.siteRules })}
                </NextLink>
              </Button>
            </div>

            <p className="text-muted-foreground border-flag-yellow/60 max-w-xl border-l-2 pl-4 text-sm">
              {t("expectRed")}
            </p>
          </div>

          <Terminal command={HERO_REPORT.command} lines={HERO_REPORT.lines} label="goflag" />
        </div>
      </div>
    </section>
  );
}
