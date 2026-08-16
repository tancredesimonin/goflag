import { ogImage } from "@goflag/og/next";
import { allLegals } from "content-collections";

import { og, ogAlt } from "@/lib/seo/og";

const image = ogImage(
  og,
  async ({ params }: { params: Promise<{ locale: string; slug: string }> }) => {
    const { locale, slug } = await params;
    const doc = allLegals.find((entry) => entry.locale === locale && entry.slug === slug);
    const title = doc?.seo?.title ?? doc?.title ?? "Legal";

    return {
      title,
      subtitle: doc?.seo?.description,
      label: "legal",
      alt: ogAlt(title, locale),
    };
  },
);

export const generateImageMetadata = image.generateImageMetadata;
export default image.render;
