import { getTranslations } from "next-intl/server";

import FAQ from "@/components/shadcn-studio/blocks/faq-component-07/faq-component-07";
import { PROOF } from "@/lib/constants";

export async function Faq() {
  const t = await getTranslations("home.faq");

  const keys = ["source", "next", "chromium", "privacy", "free"] as const;

  return (
    <FAQ
      title={t("title")}
      faqItems={[
        ...keys.map((key) => ({ question: t(`${key}.q`), answer: t(`${key}.a`) })),
        {
          question: t("scale.q"),
          answer: t("scale.a", {
            pages: PROOF.largestSitePages,
            duration: PROOF.largestSiteDuration,
          }),
        },
      ]}
    />
  );
}
