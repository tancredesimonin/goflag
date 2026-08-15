import { createTranslator } from "next-intl";

import en from "../../messages/en.json";
import es from "../../messages/es.json";
import fr from "../../messages/fr.json";
import pt from "../../messages/pt.json";

import { defaultLocale, type Locale } from "./config";

const MESSAGES = { en, fr, es, pt } satisfies Record<Locale, unknown>;

/**
 * A translator that needs no request.
 *
 * `getTranslations` resolves its locale through the request config, and the
 * request config reaches for `headers()`. Next runs `generateImageMetadata` the
 * way it runs `generateStaticParams` — at build time, with no request — so
 * calling it there does not degrade, it fails the build outright:
 *
 *     Route /[locale]/changelog/opengraph-image/[__metadata_id__] used
 *     `headers()` inside `generateStaticParams`.
 *
 * The messages are plain JSON, so a translator built straight from them works
 * in either context. Both the card's title and its `alt` go through this one,
 * because a card whose image and whose description were read two different ways
 * is the drift `og:image:alt` exists to close.
 */
export function staticTranslator(locale: string) {
  const messages = MESSAGES[locale as Locale] ?? MESSAGES[defaultLocale];

  return createTranslator({ locale, messages });
}
