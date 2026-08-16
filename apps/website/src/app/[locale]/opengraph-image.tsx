import { ogImage } from "@goflag/og/next";

import { staticTranslator } from "@/i18n/static";
import { og, ogAlt } from "@/lib/seo/og";

const image = ogImage(og, async ({ params }: { params: Promise<{ locale: string }> }) => {
  const { locale } = await params;
  const t = staticTranslator(locale);
  const title = t("home.hero.title");

  return { title, subtitle: t("home.hero.lead"), alt: ogAlt(title, locale) };
});

export const generateImageMetadata = image.generateImageMetadata;
export default image.render;
