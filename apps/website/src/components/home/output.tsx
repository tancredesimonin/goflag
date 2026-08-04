import { getTranslations } from "next-intl/server";

import { Terminal } from "@/components/site/terminal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FULL_REPORT, GATE_REPORT, SUMMARY_REPORT } from "@/lib/terminal-samples";

export async function Output() {
  const t = await getTranslations("home.terminal");

  const views = [
    { sample: FULL_REPORT, label: t("tabs.full") },
    { sample: SUMMARY_REPORT, label: t("tabs.summary") },
    { sample: GATE_REPORT, label: t("tabs.gate") },
  ];

  return (
    <section className="bg-muted/40 border-y py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 max-w-3xl space-y-4">
          <h2 className="text-3xl font-semibold text-balance md:text-4xl">{t("title")}</h2>
          <p className="text-muted-foreground text-lg">{t("lead")}</p>
        </div>

        <Tabs defaultValue={FULL_REPORT.id}>
          <TabsList className="mb-4">
            {views.map(({ sample, label }) => (
              <TabsTrigger
                key={sample.id}
                value={sample.id}
                className="font-mono text-xs sm:text-sm"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          {views.map(({ sample }) => (
            <TabsContent key={sample.id} value={sample.id}>
              <Terminal command={sample.command} lines={sample.lines} />
            </TabsContent>
          ))}
        </Tabs>

        <p className="text-muted-foreground mt-4 text-sm">{t("caption")}</p>
      </div>
    </section>
  );
}
