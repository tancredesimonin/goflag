import { ArrowRightIcon } from "lucide-react";
import NextLink from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";

/**
 * Deliberately short. The flags, the version pinning argument and the exit
 * codes used to live here; they are reference material, and reference material
 * on a landing page is a section the reader has to scroll past. The two-moment
 * table stays because it sells the two use cases; everything else is one line
 * and a link into the CI recipes.
 */
export async function Ci() {
  const t = await getTranslations("home.ci");

  const moments = [
    { when: t("mrWhen"), against: t("mrAgainst"), answers: t("mrAnswers") },
    { when: t("deployWhen"), against: t("deployAgainst"), answers: t("deployAnswers") },
  ];

  return (
    <section className="py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 max-w-3xl space-y-4">
          <h2 className="text-3xl font-semibold text-balance md:text-4xl">{t("title")}</h2>
          <p className="text-muted-foreground text-lg">{t("lead")}</p>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">
                  {t("whenHeader")}
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  {t("againstHeader")}
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  {t("answersHeader")}
                </th>
              </tr>
            </thead>
            <tbody>
              {moments.map((moment) => (
                <tr key={moment.when} className="border-t">
                  <th scope="row" className="px-5 py-4 font-medium">
                    {moment.when}
                  </th>
                  <td className="text-muted-foreground px-5 py-4">{moment.against}</td>
                  <td className="px-5 py-4">{moment.answers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-muted-foreground mt-6">{t("detail")}</p>

        <Button variant="ghost" className="group mt-2 -ml-4" asChild>
          <NextLink href="/docs/ci">
            {t("docsCta")}
            <ArrowRightIcon className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </NextLink>
        </Button>
      </div>
    </section>
  );
}
