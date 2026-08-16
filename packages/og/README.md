# @goflag/og

> The share card a multilingual site puts in front of every link, and the
> `favicon.ico` no Next convention can emit.

This is the third piece of [goflag](https://github.com/tancredesimonin/goflag).
goflag **reports** that a page has no `og:image`, no `og:image:alt`, no
`og:locale:alternate`. `@goflag/next` produces the metadata around them. This
produces the picture itself — and it exists because a rule whose remedy is
"either an asset or a route you have to write" turns into permanent debt.
`og.image.missing` fired 24 times on one site and `og.image.alt` 46 times on
another before there was anything to do about it.

Node `>=22`. `react` is a peer dependency and `next` an optional one; the
runtime depends on nothing.

## The core renders nothing

That is the design, not an omission. `defineOg` returns a JSX tree, a size and
an alt; `@goflag/og/next` hands the tree to `ImageResponse`, which embeds
satori. So this package installs no renderer on a site that already has one —
and a card can be asserted about in a plain unit test, with no framework build
anywhere near it.

```tsx
// lib/og.tsx
import { defineOg } from "@goflag/og";

export const og = defineOg({
  name: "Example",
  footer: "example.com",
  mark: (side) => <Logo size={side} />,
  tokens: {
    bg: "#200b03",
    fg: "#dfcab2",
    dim: "#9e7f69",
    border: "#4b2915",
    accent: "#ab4500",
  },
  fit: { steps: [{ upTo: 32, fontSize: 72 }], smallest: 48 },
});
```

### The tokens will drift unless something compares them

Satori resolves no CSS variable and does not speak `oklch()`, so a theme written
in OKLCH has to be restated as sRGB somewhere. That duplication is forced. Going
unnoticed when the theme moves is not — and it is what actually happens. On one
of these sites all four transcribed greys were wrong, by a hue step and by
sixteen levels: invisible, which is exactly why the comment claiming they were
the theme's colours was never going to be enough.

So `oklchPalette` is here, and there are two honest ways to use it. In a build
script, read the stylesheet and there is nothing left to transcribe:

```js
const theme = oklchPalette(readFileSync("src/app/globals.css", "utf8"), { scope: ".dark" });
```

In a module a bundler will pick up, where reading a file by relative path is a
bet on the working directory, keep the literals and let a test hold them:

```ts
const theme = oklchPalette(readFileSync("src/app/globals.css", "utf8"), { scope: ":root" });
expect(theme.terminal).toBe(OG_TOKENS.bg);
```

**Name the scope.** A theme declares the same property once per scheme, and
without a scope the first declaration in the file wins — the light one, on a
site whose card is dark.

### `fit` is required, and this package ships no default for it

Satori cannot measure text before rendering, so there is no honest `fitText` to
write. What is left is a degression: count the glyphs, pick a step, and let
`lineClamp` and `textWrap: balance` catch the rest.

**The boundaries are yours, and they have to be measured.** List every title a
card on your site can carry, count the graphemes, and put the boundaries in the
gaps between the clusters. Two sites did this and got tables that share no
number: one is calibrated on rule ids with sentence-long summaries, the other on
fifteen page titles grouped at 5–31 and 51–56 glyphs. Reusing the first table on
the second site put a boundary exactly on its longest real title — so two
locales would have rendered a size apart over one character of difference, which
is worse than not degrading at all. A default here would be that defect,
shipped.

## The routes

```tsx
// app/[locale]/opengraph-image.tsx
import { ogImage } from "@goflag/og/next";
import { og } from "@/lib/og";

const image = ogImage(og, async ({ params }) => {
  const { locale } = await params;
  const t = translator(locale);

  return { title: t("hero.title"), subtitle: t("hero.lead"), alt: t("meta.ogAlt") };
});

export const generateImageMetadata = image.generateImageMetadata;
export default image.render;
```

**`generateImageMetadata`, never the `alt` export.** Next's static `alt` is one
constant string per file, and the description of a generated card cannot be a
constant: the card carries the page's title as pixels, so the sentence
describing it is translated and derived from data.

**Do not call `getTranslations` in there.** Next runs `generateImageMetadata`
the way it runs `generateStaticParams` — at build time, with no request — and a
request-scoped i18n config reaches for `headers()`, so the build fails outright:

```
Route /[locale]/changelog/opengraph-image/[__metadata_id__] used
`headers()` inside `generateStaticParams`.
```

Build a translator straight from your message JSON instead. It is four lines,
and this package deliberately does not ship them: they are four lines of one
i18n library, and depending on that library to save them would cost every
consumer more than it saved.

`ogIcon(og, 180)` gives `icon.tsx` and `apple-icon.tsx` the same mark and the
same palette. `ogCatchAllRoute(og, …)` covers the one case Next has no
convention for at all — **it refuses to place a metadata image under a
catch-all segment**, so a `[...slug]` route needs a `force-static` route handler
instead. That is a special case, not the normal path: an ordinary `[slug]`
segment takes `opengraph-image.tsx` directly.

## The `.ico`, and why it is guarded

No Next convention emits an ICO. `favicon.ico` is a static file; `icon.tsx` goes
through `ImageResponse`, which produces PNG. So `buildIco` packs the container —
pure byte arithmetic, no dependency — out of PNGs **your** site rasterised, with
the `sharp` it already has for image optimisation. This package installs no
rasteriser, for the same reason it embeds no font.

```js
import { writeIco } from "@goflag/og";
import sharp from "sharp";

const svg = readFileSync("src/app/icon.svg");
const sizes = [16, 32, 48];

const status = await writeIco(
  "public/favicon.ico",
  () =>
    Promise.all(
      sizes.map(async (width) => ({
        width,
        bytes: await sharp(svg, { density: 384 }).resize(width, width).png().toBuffer(),
      })),
    ),
  {
    lock: ".favicon-fingerprint",
    fingerprintOf: [svg, ...sizes],
    check: process.argv.includes("--check"),
  },
);
```

An artefact that is both generated **and** committed has a failure mode of its
own: a pre-commit hook regenerates it every commit, `sharp` encodes the same
pixels into slightly different bytes across versions, and the file is dirtied by
every commit that touches anything. The noise gets committed, review learns to
skip it, and a real change to the icon arrives invisible in the same diff.

So the fingerprint is taken over the **inputs** and never over the output's
bytes. `check` returns `"stale"` or `"absent"` and writes nothing, which is what
makes the file verifiable in CI rather than regenerated in a hook — a hook that
rewrites a file cannot fail a build; a check that writes nothing can.
`writeIcons` is the same guard over a whole set, for the sites that ship
`apple-touch-icon.png` and the PWA sizes alongside.

## What this is not

- **Not a gallery of templates.** One card, driven by tokens.
  [ogimagecn](https://github.com/shadcn-labs) occupies the other ground.
- **Not a renderer.** No satori and no `@resvg/resvg-js` in the dependency tree,
  so no native binary and no Alpine friction. A non-Next binding is about fifty
  lines the day a non-Next site exists.
- **Not a rasteriser**, including for the `.ico`. The core packs buffers; the
  site produces them.
- **Not RTL-capable.** Satori does not do RTL. Every locale these sites serve is
  latin, and this is a hard boundary rather than a missing feature.

## Licence

MIT. See [LICENSE](./LICENSE).
