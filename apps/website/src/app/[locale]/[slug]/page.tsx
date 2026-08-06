import { allLegals } from "content-collections";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";

import { Mdx } from "@/components/docs/mdx";
import { requireLocale, routes } from "@/lib/seo/site";

interface PageProps {
  params: Promise<{ locale: string; slug: string }>;
}

function findLegal(locale: string, slug: string) {
  return allLegals.find((doc) => doc.locale === locale && doc.slug === slug);
}

export function generateStaticParams() {
  return allLegals.map((page) => ({
    locale: page.locale,
    slug: page.slug,
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: segment, slug } = await params;
  const locale = requireLocale(segment);
  const doc = findLegal(locale, slug);
  if (!doc) return {};

  const title = doc.seo?.title ?? doc.title;
  const description = doc.seo?.description ?? doc.title;

  // No `availableLocales` here any more: which locales this notice exists in is
  // derived once, in the registry, and the sitemap reads the same answer.
  return routes.metadata({
    locale,
    path: `/${slug}`,
    title,
    description,
    absoluteTitle: Boolean(doc.seo?.title),
  });
}

export default async function LegalPage({ params }: PageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const doc = findLegal(locale, slug);
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
