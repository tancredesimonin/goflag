import { getTranslations } from "next-intl/server";

/**
 * Positioning, not a feature list: one paragraph on what the interface is,
 * one naming the tools to use instead. The eight-item "no dashboard, no
 * account…" litany that used to live here argued against the product harder
 * than it argued for it — what goflag does not do is implied by what it does.
 */
export async function NotThis() {
  const t = await getTranslations("home.not");

  return (
    <section className="py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 max-w-3xl">
          <h2 className="text-3xl font-semibold text-balance md:text-4xl">{t("title")}</h2>
        </div>

        <div className="max-w-3xl space-y-4 border-l-2 pl-4 leading-relaxed">
          <p>{t("closing")}</p>
          <p className="text-muted-foreground">{t("versus")}</p>
        </div>
      </div>
    </section>
  );
}
