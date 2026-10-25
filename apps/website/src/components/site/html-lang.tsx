"use client";

import { useEffect } from "react";

/**
 * Keeps `<html lang>` in step with the locale segment after a client-side
 * navigation.
 *
 * The attribute is written by the root layout, which Next renders once per
 * page load and never again while the reader navigates: a switch from `/fr`
 * to `/en` re-renders the `[locale]` layout and everything under it, but the
 * `<html>` element above keeps the `lang` the first page set. Nothing below
 * the root layout can render that element, so the segment that knows the
 * locale sets the attribute from the client instead, once per change.
 *
 * The server still writes the right value into the HTML it sends, and the
 * effect does nothing on a fresh load — the two agree. It only matters after
 * the first in-app navigation across locales, which is also the only moment
 * the attribute can be wrong.
 */
export function HtmlLang({ lang }: { lang: string }) {
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return null;
}
