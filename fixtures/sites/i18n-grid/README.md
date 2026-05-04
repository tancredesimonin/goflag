# i18n grid fixture (Phase 7)

Tiny static site exercising the crawler + i18n matrix end-to-end.

## Shape

- **4 locales** as URL prefixes: `/en`, `/fr`, `/de`, `/es`
- **3 routes** under each locale: `/`, `/blog`, `/blog/post`

Every page declares the full matrix of `<link rel="alternate" hreflang="...">`
including `x-default` (which resolves to the `en` variant). Each page links
to its sibling routes via `<a href>` so a `--depth 2` crawl from any locale's
home page covers the whole grid.

The `de` locale also serves a deliberately broken variant
(`/de/blog/post`) that omits its back-link to `/fr/blog/post` — used by the
hreflang reciprocity integration test (`reciprocity.test.ts`).
