import { ImageResponse } from "next/og";

import type { Og, OgCardContent } from "../card.js";

/**
 * `@goflag/og/next` — the framework half, and deliberately the small one.
 *
 * `docs/og-plan.md` §2 measured the split: of everything an OG image is made
 * of, the only part tied to a framework is the file convention. So this is the
 * convention and nothing else — `ImageResponse` around a tree the core built,
 * `generateImageMetadata` around an `alt` the site translated, and the one
 * workaround that took real time to find.
 *
 * ### The trap this exists to stop you rediscovering
 *
 * **`getTranslations` cannot be called from `generateImageMetadata`.** Next runs
 * it the way it runs `generateStaticParams` — at build time, with no request —
 * and a request-scoped i18n config reaches for `headers()`, so the build fails
 * outright rather than degrading:
 *
 *     Route /[locale]/changelog/opengraph-image/[__metadata_id__] used
 *     `headers()` inside `generateStaticParams`.
 *
 * Both sites this package came from hit it and both wrote the same four-line
 * translator over their message JSON. That translator is **not** exported here:
 * it is four lines of `next-intl`, and importing it would make this package
 * depend on one i18n library to save them. What is packaged is the shape that
 * makes it unnecessary to think about — `loader` is called once per export, and
 * whatever it returns for `alt` is what the metadata carries.
 */

/** Whatever Next hands the two exports of one `opengraph-image` file. */
export interface RouteContext<Params> {
  readonly params: Promise<Params>;
}

export type CardLoader<Params> = (
  context: RouteContext<Params>,
) => OgCardContent | Promise<OgCardContent>;

export interface OgImageRoute<Params> {
  generateImageMetadata: (context: RouteContext<Params>) => Promise<ImageMetadataEntry[]>;
  render: (context: RouteContext<Params>) => Promise<ImageResponse>;
}

export interface ImageMetadataEntry {
  readonly id: string;
  readonly size: { readonly width: number; readonly height: number };
  readonly contentType: string;
  readonly alt?: string;
}

/**
 * The two exports an `opengraph-image.tsx` file needs, from one loader.
 *
 * ```tsx
 * const image = ogImage(og, async ({ params }) => {
 *   const { locale } = await params;
 *   const t = translator(locale);           // yours, request-free — see above
 *   return { title: t("hero.title"), alt: t("meta.ogAlt", { title: t("hero.title") }) };
 * });
 *
 * export const generateImageMetadata = image.generateImageMetadata;
 * export default image.render;
 * ```
 *
 * **Why `generateImageMetadata` and not the `alt` export.** Next's static `alt`
 * is one constant string per file, which is exactly what the description of a
 * generated card cannot be: the card carries the page's title as pixels, so the
 * sentence describing it is translated and derived from data.
 * `generateImageMetadata` carries it per image instead. That is the difference
 * between an `og:image` a screen reader can announce and one it cannot, and the
 * reason `og.image.alt` fired 46 times on the goflag site before it existed.
 *
 * One entry, always: these are single-card pages. A route needing several would
 * be calling `og.card()` itself, which is why the core exposes it.
 */
export function ogImage<Params = Record<string, string>>(
  og: Og,
  loader: CardLoader<Params>,
): OgImageRoute<Params> {
  return {
    generateImageMetadata: async (context) => {
      // The loader and nothing else: building the tree here would render the
      // card twice per route, and the metadata only ever wanted the sentence.
      const { alt } = await loader(context);

      return [{ id: "og", size: og.size, contentType: og.contentType, alt }];
    },
    render: async (context) => {
      const { element, size } = og.card(await loader(context));

      return new ImageResponse(element, size);
    },
  };
}

/**
 * `icon.tsx` and `apple-icon.tsx`, from the same tokens as the card.
 *
 * ```tsx
 * const icon = ogIcon(og, 180);
 * export const size = icon.size;
 * export const contentType = icon.contentType;
 * export default icon.render;
 * ```
 *
 * §6.3, and note what it does **not** promise: `ImageResponse` emits PNG, so
 * this produces a `<link rel="icon" type="image/png">` and never a
 * `/favicon.ico`. That file is out of reach of every Next convention, which is
 * what `buildIco` in the core is for.
 */
export function ogIcon(og: Og, side: number): OgIconRoute {
  const { element, size, contentType } = og.icon(side);

  return { size, contentType, render: () => new ImageResponse(element, size) };
}

export interface OgIconRoute {
  readonly size: { readonly width: number; readonly height: number };
  readonly contentType: string;
  render: () => ImageResponse;
}

export interface CatchAllOptions<Entry> {
  readonly entries: readonly Entry[];
  readonly slugOf: (entry: Entry) => string;
  readonly card: (entry: Entry) => OgCardContent;
}

/**
 * Spelled out rather than inferred: the inferred type reaches `Response`
 * through `@types/node`'s bundled `undici-types`, which `tsup --dts` cannot
 * name from outside this package.
 */
export interface CatchAllRoute {
  generateStaticParams: () => { slug: string[] }[];
  GET: (request: Request, context: { params: Promise<{ slug: string[] }> }) => Promise<Response>;
}

/**
 * The catch-all workaround, packaged.
 *
 * **Next refuses to place a metadata image under a catch-all segment**, so a
 * `[...slug]` route cannot use `opengraph-image.tsx` at all. A `force-static`
 * route handler with its own `generateStaticParams` is the way through, and
 * finding that out cost real time on the first site.
 *
 * A special case and not the normal path — §10.5, where the second site turned
 * out not to need it: its legal pages sit under `[slug]`, an ordinary dynamic
 * segment, where `opengraph-image.tsx` drops straight in.
 *
 * The slug is looked up in a collection rather than read off the request, so
 * this cannot be turned into a renderer for arbitrary text on the site's card.
 */
export function ogCatchAllRoute<Entry>(og: Og, options: CatchAllOptions<Entry>): CatchAllRoute {
  return {
    generateStaticParams: () =>
      options.entries.map((entry) => ({ slug: options.slugOf(entry).split("/") })),

    GET: async (_request, context) => {
      const { slug } = await context.params;
      const entry = options.entries.find(
        (candidate) => options.slugOf(candidate) === slug.join("/"),
      );

      if (!entry) {
        return new Response("Not found\n", {
          status: 404,
          headers: { "content-type": "text/plain" },
        });
      }

      const { element, size } = og.card(options.card(entry));

      return new ImageResponse(element, size);
    },
  };
}
