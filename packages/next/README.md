# @goflag/next

> Declare a Next.js App Router site's routes once. Derive the metadata, the
> hreflang cluster, the sitemap and robots.txt from that one declaration.

This is the other half of [goflag](https://github.com/tancredesimonin/goflag).
goflag **audits** a site for defects that are invisible in a browser and
expensive in search. This produces the HTML that has none of them.

The point is not convenience. A sitemap derived separately from the metadata is
two derivations of one truth, held in agreement by vigilance — and their
disagreement is what goflag reports as `hreflang.sitemap-mismatch`. Projecting
both from one registry makes it unrepresentable.

Node `>=22`. `next` is a peer dependency; the runtime depends on nothing.

## Use

```ts
// lib/site.ts
import { collection, defineSite } from "@goflag/next";
import { allDocs, allLegals } from "content-collections";

export const site = defineSite({
  baseUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://example.com",
  name: "Example",
  locales: ["en", "fr", "pt-br"],
  defaultLocale: "en",
  indexable: process.env.APP_ENV === "production",
  localeTags: { en: { openGraph: "en_US" }, fr: { openGraph: "fr_FR" } },
});

export const routes = site.routes({
  home: { path: "" },
  legal: collection(allLegals, { path: (d) => `/${d.slug}`, locale: (d) => d.locale }),
  docs: collection(allDocs, { path: (d) => `/docs/${d.slug}`, locale: "en", ogType: "article" }),
});
```

**A fixed `locale` means the route stands alone; a derived or absent one means
it clusters.** The documentation says `locale: "en"` because it is English and
only English. A legal notice says `locale: (doc) => doc.locale` because its
cluster is whatever has actually been translated — derived from the content, not
declared a second time.

Then three files stop containing logic:

```ts
// app/[locale]/page.tsx
export async function generateMetadata({ params }) {
  const { locale } = await params;
  return routes.metadata({ path: "", locale, title: "…", description: "…" });
}

// app/sitemap.ts
export default () => routes.sitemap({ lastModified: new Date() });

// app/robots.ts
export default () => routes.robots();

// app/layout.tsx
export const metadata = site.rootMetadata({ description: "…" });
```

### Keeping a page out of the sitemap

```ts
search: { path: "/search", sitemap: false },
versions: collection(all, { path, locale, sitemap: (v) => v.version === LATEST }),
```

Listed by default; the omission is what gets declared. An excluded route keeps
its canonical, its cluster and every refusal — it says _not an entry point_,
never _not a page_.

It hides nothing: a sitemap aids discovery and does not gate indexing, so a
linked page is indexed whether or not it appears in one. Use it for pages that
should not be entry points — search results, faceted variants, print views. To
keep something out of an index, the instruments are `noindex` and `canonical`.

## What it refuses to do

Every one of these is a defect that ships silently and is expensive to find
later, so it fails the build instead:

| Refused                                            | Because                                                                      |
| -------------------------------------------------- | ---------------------------------------------------------------------------- |
| A path no route declares                           | the page would render a canonical and be absent from the sitemap             |
| Two routes on one path                             | the head and the sitemap would describe different routes under one URL       |
| A locale a route does not serve                    | the canonical would name a page that was never built                         |
| A collection entry in a locale the site omits      | the content and the declaration contradict each other; neither wins silently |
| `baseUrl` with a path, or a malformed language tag | both double into every canonical and every `hreflang` on the site            |
| `og:locale` for a territoryless locale             | ogp.me defines it as `language_TERRITORY`; guessing one picks an audience    |

And two things it gets right that hand-written versions usually do not:

- **`x-default` points at a locale the route actually serves.** Aiming it at the
  site default unconditionally means a page translated into two languages that
  exclude the default advertises an `x-default` that 404s.
- **`alternates.languages` is ordered by the site's own locale order**, so a
  collection returning its entries in a different sequence cannot reorder the
  sitemap and make every diff unreadable.

## What it deliberately does not do

- **No `generateStaticParams`.** The shape of the params is a property of the
  file-system route (`[slug]` versus `[[...slug]]`), which the registry does not
  know. `routes.family("docs")` hands you the routes; deriving the segments from
  them is three lines you can see, rather than a guess you cannot.
- **No `lastModified` unless you supply one.** A date nobody gave would be this
  library asserting when the content changed.
- **No environment variables.** `NEXT_PUBLIC_…` and `APP_ENV` are one codebase's
  naming conventions. Your site computes; this derives.
- **No JSON-LD, no `next-intl` wrapper, no React components.**

## Status

`0.x`, extracted from real sites, API unstable. Pages Router is out of scope.

## License

MIT
