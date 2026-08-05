import { allLegals } from "content-collections";

import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/seo/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const doc = allLegals.find((entry) => entry.locale === locale && entry.slug === slug);

  return ogImage({
    title: doc?.seo?.title ?? doc?.title ?? "Legal",
    subtitle: doc?.seo?.description,
    label: "legal",
  });
}
