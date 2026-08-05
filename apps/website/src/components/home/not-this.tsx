import { XIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

export async function NotThis() {
  const t = await getTranslations("home.not");

  const items = [
    "dashboard",
    "account",
    "rank",
    "vitals",
    "score",
    "config",
    "gallery",
    "telemetry",
  ] as const;

  return (
    <section className="py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 max-w-3xl space-y-4">
          <h2 className="text-3xl font-semibold text-balance md:text-4xl">{t("title")}</h2>
          <p className="text-muted-foreground text-lg">{t("lead")}</p>
        </div>

        <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item} className="text-muted-foreground flex items-start gap-3">
              <XIcon className="text-flag-red mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span className="text-[0.9375rem]">{t(`items.${item}`)}</span>
            </li>
          ))}
        </ul>

        <p className="mt-10 max-w-3xl border-l-2 pl-4 leading-relaxed">{t("closing")}</p>
      </div>
    </section>
  );
}
