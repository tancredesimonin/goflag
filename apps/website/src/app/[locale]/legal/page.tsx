import { allLegals } from "content-collections";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";

import { Mdx } from "@/components/docs/mdx";
import { buildPageMetadata } from "@/lib/seo/metadata";

interface PageProps {
  params: Promise<{ locale: string }>;
}

function findLegal(locale: string) {
  return allLegals.find((doc) => doc.locale === locale && doc.slug === "legal");
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const doc = findLegal(locale);
  if (!doc) return {};

  return buildPageMetadata({
    locale,
    path: "/legal",
    title: doc.title,
    description: doc.description,
    // Only the locales this document was actually translated into, so the
    // alternates never point at a page that does not exist.
    availableLocales: allLegals
      .filter((entry) => entry.slug === "legal")
      .map((entry) => entry.locale),
  });
}

export default async function LegalPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const doc = findLegal(locale);
  if (!doc) notFound();

  const t = await getTranslations("legal");
  const format = await getFormatter();

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="font-display text-4xl font-semibold tracking-tight">{doc.title}</h1>
      <p className="text-muted-foreground mt-3 text-sm">
        {t("lastUpdated", {
          date: format.dateTime(new Date(doc.lastUpdated), { dateStyle: "long" }),
        })}
      </p>
      <div className="mt-10">
        <Mdx code={doc.content} />
      </div>
    </div>
  );
}
