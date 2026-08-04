import { EyeIcon, TerminalIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Card, CardContent } from "@/components/ui/card";

/**
 * What the crawler sees is markup, not prose: identical in every locale, and
 * ICU would read the angle brackets as tag syntax. It belongs in code, beside
 * the component, rather than in the message catalogues.
 */
const SEES = {
  one: '<link rel="canonical" href="/another-page">',
  two: 'no <link rel="alternate" hreflang> anywhere',
  three: "robots.txt → User-agent: *\n            Disallow: /",
} as const;

export async function Invisible() {
  const t = await getTranslations("home.invisible");

  const cases = ["one", "two", "three"] as const;

  return (
    <section className="py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-3xl space-y-4">
          <h2 className="text-3xl font-semibold text-balance md:text-4xl">{t("title")}</h2>
          <p className="text-muted-foreground text-lg">{t("lead")}</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {cases.map((key) => (
            <div key={key} className="reveal">
              <Card className="h-full">
                <CardContent className="flex h-full flex-col gap-5">
                  <div className="space-y-2">
                    <p className="text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
                      <EyeIcon className="size-3.5" />
                      {t("youSee")}
                    </p>
                    <p className="text-[0.9375rem]">{t(`${key}.see`)}</p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
                      <TerminalIcon className="size-3.5" />
                      {t("crawlerSees")}
                    </p>
                    <code className="bg-terminal text-terminal-foreground border-terminal-border block overflow-x-auto rounded-md border px-3 py-2 font-mono text-[0.8125rem] whitespace-pre">
                      {SEES[key]}
                    </code>
                  </div>

                  <div className="mt-auto space-y-2 border-t pt-4">
                    <p className="text-flag-red text-xs font-medium tracking-wide uppercase">
                      {t("consequence")}
                    </p>
                    <p className="text-muted-foreground text-[0.9375rem]">
                      {t(`${key}.consequence`)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
