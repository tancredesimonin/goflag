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
  ];

  return (
    <section className="bg-muted/40 border-y py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-3xl space-y-4">
          <h2 className="text-3xl font-semibold text-balance md:text-4xl">{t("title")}</h2>
          <p className="text-muted-foreground text-lg">{t("lead")}</p>
        </div>

        <dl className="grid gap-6 sm:grid-cols-3">
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
      </div>
    </section>
  );
}
