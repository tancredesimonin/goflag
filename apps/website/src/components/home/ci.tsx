import { getTranslations } from "next-intl/server";

import { Card, CardContent } from "@/components/ui/card";
import { EXIT_CODES } from "@/lib/cli-reference";
import { cn } from "@/lib/utils";

const TONE = {
  green: "text-flag-green",
  yellow: "text-flag-yellow",
  red: "text-flag-red",
} as const;

export async function Ci() {
  const t = await getTranslations("home.ci");

  const moments = [
    { when: t("mrWhen"), against: t("mrAgainst"), answers: t("mrAnswers") },
    { when: t("deployWhen"), against: t("deployAgainst"), answers: t("deployAnswers") },
  ];

  const notes = [
    { title: t("flagsTitle"), body: t("flagsBody") },
    { title: t("pinTitle"), body: t("pinBody") },
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

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {notes.map((note) => (
            <Card key={note.title}>
              <CardContent className="space-y-2">
                <h3 className="font-mono text-sm font-semibold">{note.title}</h3>
                <p className="text-muted-foreground text-[0.9375rem] leading-relaxed">
                  {note.body}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-8">
          <h3 className="mb-4 font-semibold">{t("exitTitle")}</h3>
          <dl className="divide-y rounded-lg border">
            {EXIT_CODES.map((exit) => (
              <div key={exit.code} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:gap-6">
                <dt className={cn("shrink-0 font-mono text-sm font-semibold", TONE[exit.tone])}>
                  {exit.code} · {exit.label}
                </dt>
                <dd className="text-muted-foreground text-[0.9375rem]">{exit.meaning}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
