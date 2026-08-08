import { getTranslations } from "next-intl/server";

import FAQ from "@/components/shadcn-studio/blocks/faq-component-07/faq-component-07";
import { PROOF } from "@/lib/constants";

export async function Faq() {
  const t = await getTranslations("home.faq");

  // `remedy` is the only mention of the library on this page, and it sits here
  // on purpose. The landing sells the audit; someone who reads this far is
  // asking the question the library answers.
  const keys = ["source", "next", "remedy", "chromium", "privacy", "free"] as const;

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
