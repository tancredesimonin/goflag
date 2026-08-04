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
    { value: String(PROOF.falsePositivesFound), label: t("stat4") },
  ];

  const stories = [
    { title: t("storyTitle"), body: t("storyBody"), punch: t("storyPunch") },
    { title: t("fpTitle"), body: t("fpBody"), punch: t("fpPunch") },
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

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {stories.map((story) => (
            <div
              key={story.title}
              className="reveal bg-background flex h-full flex-col gap-3 rounded-lg border p-6"
            >
              <h3 className="text-lg font-semibold">{story.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{story.body}</p>
              <p className="border-flag-red/50 mt-auto border-l-2 pl-4 font-mono text-sm leading-relaxed">
                {story.punch}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
