import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Ci } from "@/components/home/ci";
import { Closing } from "@/components/home/closing";
import { Faq } from "@/components/home/faq";
import { HeroWorkflow } from "@/components/home/hero-workflow";
import { Invisible } from "@/components/home/invisible";
import { Method } from "@/components/home/method";
import { NotThis } from "@/components/home/not-this";
import { Output } from "@/components/home/output";
import { Proof } from "@/components/home/proof";
import { routeMetadata } from "@/lib/seo/site-routes";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta.home" });

  return routeMetadata({
    locale,
    path: "",
    title: t("title"),
    absoluteTitle: true,
    description: t("description"),
  });
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <HeroWorkflow />
      <Invisible />
      <Output />
      <Method />
      <Ci />
      <Proof />
      <NotThis />
      <Faq />
      <Closing />
    </>
  );
}
