import { staticTranslator } from "@/i18n/static";
import { ogImage, ogImageMetadata } from "@/lib/seo/og";

/** The card's copy, read once and used by both exports below. */
async function card(params: Promise<{ locale: string }>) {
  const { locale } = await params;
  const t = staticTranslator(locale);

  return { locale, title: t("home.hero.title"), subtitle: t("home.hero.lead") };
}

export async function generateImageMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale, title } = await card(params);

  return ogImageMetadata(title, locale);
}

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { title, subtitle } = await card(params);

  return ogImage({ title, subtitle });
}
