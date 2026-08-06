import { getTranslations } from "next-intl/server";

import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/seo/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: { locale: string } }) {
  const t = await getTranslations({ locale: params.locale, namespace: "home.hero" });

  return ogImage({ title: t("title"), subtitle: t("lead") });
}
