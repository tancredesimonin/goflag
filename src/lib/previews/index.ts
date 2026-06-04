/**
 * Public surface of the preview package.
 *
 * Engine-pure exports (resolve, types, fixtures, tag-key) live alongside
 * the React components but never import them, so this module is safe to
 * import from anywhere — including the future `@goflag/core` standalone
 * engine package.
 */

export type {
  PreviewData,
  PreviewField,
  PreviewImage,
  PreviewPlatform,
  PreviewProps,
  PreviewSource,
  PreviewSourceProbe,
  TagKey,
} from "./types";
export { PREVIEW_PLATFORMS } from "./types";
export { resolvePreview, displayHost, displayUrl } from "./resolve";
export {
  TITLE_KEY,
  HTML_LANG_KEY,
  isSuppressed,
  listTagKeys,
  metaSuppressed,
  linkSuppressed,
  metaKey,
  linkKey,
  jsonLdKey,
  tagKeyFromOrigin,
} from "./tag-key";
export {
  FIXTURE_PAGES,
  FIXTURE_NAMES,
  tancredeFull,
  minimalPage,
  missingImagePage,
} from "./fixtures";
export type { FixtureName } from "./fixtures";

export { GoogleSerpDesktop } from "./google-serp-desktop/google-serp-desktop";
export { GoogleSerpMobile } from "./google-serp-mobile/google-serp-mobile";
export { XCardSummaryLarge } from "./x-card-summary-large/x-card-summary-large";
export { XCardSummary } from "./x-card-summary/x-card-summary";
export { FacebookCard } from "./facebook/facebook";
export { LinkedInCard } from "./linkedin/linkedin";
export { DiscordEmbed } from "./discord/discord";
export { SlackUnfurl } from "./slack/slack";
export { WhatsAppPreview } from "./whatsapp/whatsapp";
export { IMessageBubble } from "./imessage/imessage";
export { PinterestPin } from "./pinterest/pinterest";

import { GoogleSerpDesktop } from "./google-serp-desktop/google-serp-desktop";
import { GoogleSerpMobile } from "./google-serp-mobile/google-serp-mobile";
import { XCardSummaryLarge } from "./x-card-summary-large/x-card-summary-large";
import { XCardSummary } from "./x-card-summary/x-card-summary";
import { FacebookCard } from "./facebook/facebook";
import { LinkedInCard } from "./linkedin/linkedin";
import { DiscordEmbed } from "./discord/discord";
import { SlackUnfurl } from "./slack/slack";
import { WhatsAppPreview } from "./whatsapp/whatsapp";
import { IMessageBubble } from "./imessage/imessage";
import { PinterestPin } from "./pinterest/pinterest";
import type { PreviewPlatform, PreviewProps } from "./types";
import type { ComponentType } from "react";

export const PREVIEW_COMPONENTS: Record<PreviewPlatform, ComponentType<PreviewProps>> = {
  "google-serp-desktop": GoogleSerpDesktop,
  "google-serp-mobile": GoogleSerpMobile,
  "x-card-summary-large": XCardSummaryLarge,
  "x-card-summary": XCardSummary,
  facebook: FacebookCard,
  linkedin: LinkedInCard,
  discord: DiscordEmbed,
  slack: SlackUnfurl,
  whatsapp: WhatsAppPreview,
  imessage: IMessageBubble,
  pinterest: PinterestPin,
};
