import { getTranslations } from "next-intl/server";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PROOF } from "@/lib/constants";

/**
 * The landing page's questions, in two columns.
 *
 * The two-accordion split comes from a shadcn/studio FAQ block and is the only
 * thing worth keeping from it: one accordion of seven entries is a column of
 * headings nobody scans. Splitting the list in half means each side stays a
 * readable height, and `type="single"` per column lets two answers be open at
 * once — which is what a reader comparing them wants.
 */
export async function Faq() {
  const t = await getTranslations("home.faq");

  // `remedy` is the only mention of the library on this page, and it sits here
  // on purpose. The landing sells the audit; someone who reads this far is
  // asking the question the library answers.
  const keys = ["source", "next", "remedy", "chromium", "privacy", "free"] as const;

  const items = [
    ...keys.map((key) => ({ question: t(`${key}.q`), answer: t(`${key}.a`) })),
    {
      question: t("scale.q"),
      answer: t("scale.a", {
        pages: PROOF.largestSitePages,
        duration: PROOF.largestSiteDuration,
      }),
    },
  ];

  const half = Math.ceil(items.length / 2);
  const columns = [items.slice(0, half), items.slice(half)];

  return (
    <section className="bg-muted/40 border-y py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 max-w-3xl">
          <h2 className="text-3xl font-semibold text-balance md:text-4xl">{t("title")}</h2>
        </div>

        <div className="grid grid-cols-1 gap-x-12 gap-y-6 lg:grid-cols-2">
          {columns.map((column, index) => (
            <Accordion
              key={index}
              type="single"
              collapsible
              className="h-fit w-full rounded-lg border"
              // The first question opens itself. Its answer is what the section
              // is for; the rest are there for whoever has the matching doubt.
              defaultValue={index === 0 ? "item-1" : undefined}
            >
              {column.map((item, position) => (
                <AccordionItem key={item.question} value={`item-${position + 1}`}>
                  <AccordionTrigger className="px-5 text-base">{item.question}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground px-5 text-[0.9375rem] leading-relaxed">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ))}
        </div>
      </div>
    </section>
  );
}
