import { getTranslations } from "next-intl/server";

const STEPS = [
  {
    key: "step1",
    command: "goflag https://example.com \\\n  --baseline .goflag/baseline.json --update-baseline",
  },
  {
    key: "step2",
    command:
      "goflag http://localhost:3000 --no-external \\\n  --baseline .goflag/baseline.json --regressions-only",
  },
  {
    key: "step3",
    command: "goflag … --baseline .goflag/baseline.json --max-debt 13",
  },
] as const;

export async function Method() {
  const t = await getTranslations("home.method");

  return (
    <section className="bg-muted/40 border-y py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-3xl space-y-4">
          <h2 className="text-3xl font-semibold text-balance md:text-4xl">{t("title")}</h2>
          <p className="text-muted-foreground text-lg">{t("lead")}</p>
        </div>

        <ol className="space-y-8">
          {STEPS.map(({ key, command }, index) => (
            <li key={key} className="reveal">
              <div className="flex gap-5">
                <span
                  aria-hidden="true"
                  className="bg-background text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full border font-mono text-sm"
                >
                  {index + 1}
                </span>
                <div className="min-w-0 grow space-y-3">
                  <h3 className="text-lg font-semibold">{t(`${key}.title`)}</h3>
                  <pre className="bg-terminal text-terminal-foreground border-terminal-border overflow-x-auto rounded-lg border px-4 py-3 font-mono text-[0.8125rem] leading-relaxed">
                    <code>{command}</code>
                  </pre>
                  <p className="text-muted-foreground leading-relaxed">{t(`${key}.body`)}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
