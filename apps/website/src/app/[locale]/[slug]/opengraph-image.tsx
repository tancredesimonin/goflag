import { allLegals } from "content-collections";

import { ogImage, ogImageMetadata } from "@/lib/seo/og";

/** The card's copy, read once and used by both exports below. */
async function card(params: Promise<{ locale: string; slug: string }>) {
  const { locale, slug } = await params;
  const doc = allLegals.find((entry) => entry.locale === locale && entry.slug === slug);

  return {
    locale,
    title: doc?.seo?.title ?? doc?.title ?? "Legal",
    subtitle: doc?.seo?.description,
  };
}

export async function generateImageMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, title } = await card(params);

  return ogImageMetadata(title, locale);
}

export default async function Image({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { title, subtitle } = await card(params);

  return ogImage({ title, subtitle, label: "legal" });
}
