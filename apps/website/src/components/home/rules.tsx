import { ArrowRightIcon } from "lucide-react";
import NextLink from "next/link";
import { getTranslations } from "next-intl/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ALL_RULES, type RuleSeverity } from "@/lib/rules-catalog";
import { cn } from "@/lib/utils";

const SEVERITY_CLASS: Record<RuleSeverity, string> = {
  error: "text-flag-red border-flag-red/40",
  warning: "text-flag-yellow border-flag-yellow/40",
  info: "text-muted-foreground",
};

export async function Rules() {
  const t = await getTranslations("home.rules");

  return (
    <section className="bg-muted/40 border-y py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 max-w-3xl space-y-4">
          <h2 className="text-3xl font-semibold text-balance md:text-4xl">{t("title")}</h2>
          <p className="text-muted-foreground text-lg">{t("lead")}</p>
        </div>

        <div className="bg-background overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">
                  {t("idHeader")}
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  {t("severityHeader")}
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  {t("checksHeader")}
                </th>
              </tr>
            </thead>
            <tbody>
              {ALL_RULES.map((rule) => (
                <tr key={rule.id} className="border-t align-top">
                  <th scope="row" className="px-5 py-3 font-mono font-normal whitespace-nowrap">
                    <NextLink
                      href={`/docs/rules/${rule.id}`}
                      className="hover:text-link transition-colors"
                    >
                      {rule.id}
                    </NextLink>
                    {rule.scope === "site" ? (
                      <Badge variant="outline" className="ml-2 text-[0.6875rem] font-normal">
                        {t("scopeSite")}
                      </Badge>
                    ) : null}
                  </th>
                  <td className={cn("px-5 py-3 font-mono", SEVERITY_CLASS[rule.severity])}>
                    {rule.severity}
                  </td>
                  <td className="text-muted-foreground px-5 py-3">{rule.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-flag-yellow/50 bg-background mt-8 rounded-lg border-l-2 p-6">
          <p className="mb-2 font-semibold">{t("honestyTitle")}</p>
          <p className="text-muted-foreground leading-relaxed">{t("honestyBody")}</p>
        </div>

        <Button variant="ghost" className="group mt-6" asChild>
          <NextLink href="/docs/rules">
            {t("cta")}
            <ArrowRightIcon className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </NextLink>
        </Button>
      </div>
    </section>
  );
}
