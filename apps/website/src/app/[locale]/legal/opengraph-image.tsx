import { allLegals } from "content-collections";

import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/seo/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: { locale: string } }) {
  const doc = allLegals.find((entry) => entry.locale === params.locale && entry.slug === "legal");

  return ogImage({ title: doc?.title ?? "Legal", subtitle: doc?.description, label: "legal" });
}
