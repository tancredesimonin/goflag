import { getTranslations } from "next-intl/server";

import { PROOF } from "@/lib/constants";

export async function Proof() {
  const t = await getTranslations("home.proof");

  const stats = [
    { value: String(PROOF.sitesGated), label: t("stat1") },
    {
      value: String(PROOF.largestSitePages),
      label: t("stat2", { duration: PROOF.largestSiteDuration }),
    },
    { value: String(PROOF.tests), label: t("stat3") },
    { value: String(PROOF.pageRules + PROOF.siteRules), label: t("stat4") },
  ];

  return (
    <section className="bg-muted/40 border-y py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-3xl space-y-4">
          <h2 className="text-3xl font-semibold text-balance md:text-4xl">{t("title")}</h2>
          <p className="text-muted-foreground text-lg">{t("lead")}</p>
        </div>

        <dl className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-background rounded-lg border p-5">
              <dt className="sr-only">{stat.label}</dt>
              <dd>
                <span className="font-display block text-3xl font-semibold tracking-tight lg:text-4xl">
                  {stat.value}
                </span>
                <span className="text-muted-foreground mt-1 block text-sm">{stat.label}</span>
              </dd>
            </div>
          ))}
        </dl>

        {/* One story, not two. A second bug post-mortem stops being transparency
            and starts being a case against the tool; the strongest one carries
            the point alone. */}
        <div className="reveal bg-background mt-10 flex flex-col gap-3 rounded-lg border p-6">
          <h3 className="text-lg font-semibold">{t("storyTitle")}</h3>
          <p className="text-muted-foreground max-w-3xl leading-relaxed">{t("storyBody")}</p>
          <p className="border-flag-red/50 border-l-2 pl-4 font-mono text-sm leading-relaxed">
            {t("storyPunch")}
          </p>
        </div>
      </div>
    </section>
  );
}
