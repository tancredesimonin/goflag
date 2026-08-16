import { ogIcon } from "@goflag/og/next";

import { og } from "@/lib/seo/og";

/**
 * Rendered rather than committed, so the mark has exactly one definition — and
 * now one palette too.
 *
 * This file used to redraw the flag itself, on `#12151a` in `#e8eaed`. Neither
 * is a colour `globals.css` declares and neither is a colour the share card
 * uses: three copies of one mark, agreeing with each other nowhere.
 * `docs/og-plan.md` §6.3 is the fix — one token set, one drawing, every size.
 */
const icon = ogIcon(og, 180);

export const size = icon.size;
export const contentType = icon.contentType;
export default icon.render;
