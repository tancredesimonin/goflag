import { BotIcon, LanguagesIcon, LinkIcon, TagsIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import Features from "@/components/shadcn-studio/blocks/features-section-05/features-section-05";

export async function Checks() {
  const t = await getTranslations("home.checks");

  return (
    <Features
      title={t("title")}
      lead={t("lead")}
      featuresList={[
        {
          icon: LinkIcon,
          title: t("links.title"),
          description: t("links.body"),
          detail: t("links.detail"),
        },
        {
          icon: LanguagesIcon,
          title: t("translations.title"),
          description: t("translations.body"),
          detail: t("translations.detail"),
        },
        {
          icon: BotIcon,
          title: t("robots.title"),
          description: t("robots.body"),
          detail: t("robots.detail"),
        },
        {
          icon: TagsIcon,
          title: t("metadata.title"),
          description: t("metadata.body"),
          detail: t("metadata.detail"),
        },
      ]}
    />
  );
}
