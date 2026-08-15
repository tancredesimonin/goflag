/**
 * The two things the exported catalogue cannot carry, kept where writing belongs.
 *
 * `packages/cli/rules.json` is generated from the rule registry and holds
 * everything the engine knows about itself: id, scope, severity, rigor, sources,
 * fix snippet. It deliberately stops there.
 *
 * - **`why`** is editorial. The registry's own `why` is the rationale for the
 *   policy; this is what the mistake *costs the person reading*, which is
 *   writing and not data.
 * - **`message`** is a sample. The real one is built at audit time out of what
 *   the page actually said (`Title is 74 characters — long of…`), so a static
 *   copy can only ever be an example, and saying otherwise is how the previous
 *   mirror shipped `Conflicting indexing directives` for four versions while the
 *   engine printed `Conflicting robots directives`.
 *
 * `rules-catalog.test.ts` fails when an id here has no rule, or a rule has no
 * entry here — so adding a rule cannot silently ship without its prose, and
 * deleting one cannot leave an orphan paragraph behind.
 */

export interface RuleEditorial {
  /** What the mistake costs, in the site's voice. */
  why: string;
  /**
   * An example of the message goflag prints, with values filled in.
   *
   * Absent on a prose rule: its message *is* the question, the engine carries
   * it, and a copy here would be one more string free to drift.
   */
  message?: string;
}

export const RULE_EDITORIAL: Readonly<Record<string, RuleEditorial>> = {
  "title.missing": {
    why: "The title is the clickable line in every search result and the label of every browser tab. Without one, the engine invents a replacement from the page body, and the page competes with a heading someone wrote for a different purpose.",
    message: "Page is missing a `<title>` element (or it is empty).",
  },
  "title.length": {
    why: "Past roughly sixty characters the result gets truncated, and the truncation lands wherever it lands. A title that ends mid-word is a title whose promise the reader never saw.",
    message: "Title is 74 characters — long of the recommended 10–60 window.",
  },
  "description.missing": {
    why: "The description is not a ranking factor, and it is the only sentence you control between the title and the click. With none, the engine assembles one from whatever text sits near the matched query.",
    message: 'Page has no `<meta name="description">`.',
  },
  "description.length": {
    why: "Too short and the snippet gets padded with body text you did not choose; too long and it is cut. The window is a heuristic, not a specification; see the note on rigor below.",
    message: "Description is 31 characters — short of the recommended 50–160 window.",
  },
  "canonical.missing": {
    why: "Any tracking parameter, trailing slash or uppercase path creates a second URL serving the same page. Without a canonical, the engine picks which one to keep, and it does not have to pick yours.",
    message: 'Page is missing `<link rel="canonical">`.',
  },
  "canonical.absolute": {
    why: "This is the failure that de-indexes a site without anybody touching a page. A relative canonical resolves against `metadataBase`, which defaults to localhost, so production ships canonicals pointing at a host no crawler can reach.",
    message:
      'Canonical is "/the-page" — must be an absolute http(s) URL (consumers see the raw value, not the resolved "https://example.com/the-page").',
  },
  "viewport.missing": {
    why: "Without it a phone renders the page at desktop width and scales it down. The layout is not broken, only unreadable, which is why it survives review.",
    message: 'Page has no `<meta name="viewport">` — mobile browsers will render at desktop width.',
  },
  "og.title.missing": {
    why: "A search title and a shared-link title have different jobs: one ends in the site name for disambiguation, the other does not need it. Relying on the fallback means every share carries the search variant.",
    message: "Page has no `og:title`; consumers will fall back to `<title>` (or nothing).",
  },
  "og.description.missing": {
    why: "Only flagged when the page already carries other `og:*` tags. A page that opted into Open Graph and then skipped the description almost always did so by accident.",
    message:
      "Page has `og:*` tags but no `og:description`; unfurls will fall back to the meta description (or nothing).",
  },
  "og.image.missing": {
    why: "A link pasted into Slack, LinkedIn or iMessage with no image is a grey rectangle of text. The cost is not aesthetic: it is the click that does not happen.",
    message:
      "Page has no `og:image`. Link unfurls will fall back to text-only or a random body image.",
  },
  "og.image.absolute": {
    why: "A relative path works in every browser you test in, because a browser has the page to resolve it against. The crawler building the preview has only the tag. So the share looks exactly as broken as having no image at all — with the difference that the tag is there, and review moves on.",
    message:
      "Open Graph image URL is not absolute: `og:image` = `/og.png`. Crawlers cannot resolve it.",
  },
  "og.image.alt": {
    why: "Generated cards carry the page title as pixels. With no `og:image:alt`, that title is unavailable to anyone using a screen reader — at the moment a link is shared, which is before anyone has had the chance to open the page and find the text again.",
    message: "Page declares an `og:image` with no `og:image:alt`.",
  },
  "og.image.dimensions": {
    why: "The first time a URL is shared, the crawler has not seen the image yet. Told the size, it can lay the card out immediately; left to guess, it renders the share without the image and fetches it afterwards. The first share is usually the one that travels.",
    message: "The `og:image` declaration omits `og:image:width` or `og:image:height`.",
  },
  "og.image.ratio": {
    why: "Nothing rejects an image of the wrong shape — it gets cropped, and the consumer picks the crop. A square logo becomes a centre strip of itself, and whatever mattered in it was at the edges.",
    message:
      "`og:image` is 600×600 — a ratio of 1:1, against the 1.91:1 the preview card is laid out for. Consumers will crop it.",
  },
  "og.locale.missing": {
    why: "The protocol fills the gap for you: with no `og:locale`, the page is `en_US`. A translated site that omits the tag has not stayed silent about its language — it has told every consumer that all six translations are American English.",
    message:
      "Page declares hreflang alternates (en, es, fr) but no `og:locale`; the protocol default `en_US` applies instead.",
  },
  "og.locale.alternates": {
    why: "The same fact — this page exists in these languages — is written twice, in two vocabularies, by two pieces of code. Nothing in a build compares them, so they drift apart quietly, and the shorter list is the one hiding a translation somebody paid to have made.",
    message:
      "Open Graph and hreflang disagree about this page's translations: no `og:locale:alternate` for es, fr.",
  },
  "icons.missing": {
    why: "Nothing in a specification requires an icon, which is why nothing complains and every consumer improvises. The browser falls back to `/favicon.ico` at the root; a feed reader or a link unfurler often falls back to nothing at all, and the bookmark is a grey square among fifty.",
    message:
      'Page declares no icon: no `<link rel="icon">`, and no icons from a manifest. Consumers fall back to `/favicon.ico` if the site happens to serve one.',
  },
  "icons.apple-touch.missing": {
    why: 'iOS does not read `rel="icon"` when someone adds a site to their home screen. With no `apple-touch-icon` it takes a screenshot instead, so what they saved is a thumbnail of whatever was on screen at the moment they saved it.',
    message:
      "Page declares icons (icon) but no `apple-touch-icon`; iOS will screenshot the page instead.",
  },
  "icons.manifest-mismatch": {
    why: "Two files declare the icons and nothing compares them. Only flagged where it is genuinely a contradiction — the same file described with two different sizes, or icons that exist only in the manifest, which is not where a browser tab looks. Two lists that simply differ are the normal case, and goflag does not treat them as a defect.",
    message:
      "The manifest and the `<head>` describe the same icon differently: `/icon.png` is `32x32` in the `<head>` and `192x192` in the manifest.",
  },
  "icons.ico.missing": {
    why: "No specification asks for it, and half the internet requests it anyway. Modern browsers follow the `<link>` a page declares and never touch the root — but feed readers, link unfurlers and older crawlers ask blind, take the 404, and show nothing. Cheap to serve, invisible when absent.",
    message:
      "No `/favicon.ico` at the root: the origin answered 404. Clients that ask for it blind — feed readers, link unfurlers, older crawlers — get nothing.",
  },
  "robots.conflict": {
    why: "Three places can declare indexing policy, and a header injected by a proxy outranks the tag a developer reads in the source. This is what a staging header left on a production route looks like from the outside.",
    message:
      "Conflicting robots directives: X-Robots-Tag header say `noindex`, meta robots say `index`.",
  },
  "hreflang.missing": {
    why: "This is the blind spot goflag was built to close. Without alternates, an engine cannot tell four translations of a page from four competing pages, so they consolidate nothing and split each other's authority.",
    message:
      "Page declares no `hreflang` alternates, but the site serves 4 locales (en, es, fr, pt-br, per the sitemap). Locale variants of this route cannot be associated with each other.",
  },
  "hreflang.sitemap-mismatch": {
    why: "The head and the sitemap are two declarations of one intent, produced by different code paths, so they drift. Under-declaring hides real translations; over-declaring points hreflang at URLs the site itself does not list, which is read as a broken cluster.",
    message:
      "Route `/pricing`: the sitemap lists es, pt-br but the `<head>` does not advertise them. Both are derived from the same intent and must not disagree.",
  },
  "robots.blocks-site": {
    why: "The most expensive misconfiguration a site can carry, and it is invisible from inside a browser. Severity drops to a warning when nothing contradicts the block: a staging environment that disallows everything and claims nothing else is doing exactly what it means to.",
    message:
      '`robots.txt` disallows the whole site for `User-agent: *`, but 42 crawled pages declare `<meta name="robots" content="index">`. Both cannot be true: robots.txt wins, so the pages are never fetched and the meta tag is never read.',
  },
  "title.descriptive": {
    why: "A title that repeats the site name, or describes the section rather than the page, gives a searcher no way to tell two results apart — and gives Google a reason to rewrite it into something you did not choose.",
  },
  "description.accurate": {
    why: "The description is the one sentence you get to write in a search result. A boilerplate line repeated site-wide, or one that promises something the page does not deliver, gets replaced by improvised page text — or gets the click and loses the visitor.",
  },
  "lang.matches-content": {
    why: "A wrong `lang` is worse than a missing one: screen readers switch to the wrong pronunciation rules, browsers offer to translate a page that is already in the reader's language, and search engines file the page under the wrong audience. Nothing in the markup contradicts it, so no mechanical check can catch it.",
  },
  "og.image.representative": {
    why: "The preview image is the whole payload of a shared link. A generic site-wide banner, or artwork whose subject sits outside the ~1.91:1 crop, is present enough to pass every mechanical check and still communicate nothing.",
  },
};

/**
 * hreflang reciprocity findings, which are not rules.
 *
 * They are computed cross-page in the engine's `core/i18n.ts` and reported
 * under `missingTranslations`, not through the rule registry — which is why
 * they carry no severity and why the generated catalogue does not know about
 * them. Phase 3.5 of the product plan absorbs them into the registry; until it
 * does, they are written here rather than described as rules they are not.
 *
 * Three codes, not four: `self-mismatch` was declared in the engine and emitted
 * by no branch, so a catalogue listing it promised a finding goflag could not
 * produce. The declaration is gone as of 0.3.0.
 */
export const RECIPROCITY_CODES: ReadonlyArray<{ code: string; message: string; why: string }> = [
  {
    code: "missing-back-link",
    message:
      "`/fr/pricing` declares an alternate to `/es/precios` but the peer does not link back.",
    why: "hreflang is only honoured when it is reciprocal. A one-way declaration is discarded, so the cluster silently degrades to no cluster at all.",
  },
  {
    code: "x-default-missing",
    message: 'Page advertises 4 locales but no `hreflang="x-default"`.',
    why: "`x-default` is what a visitor whose language matches none of yours is sent to. Without it the engine guesses, and it guesses per query.",
  },
  {
    code: "locale.invalid",
    message: '`hreflang="pt_BR"` is not a valid BCP 47 tag.',
    why: "An invalid tag is not a fallback, it is ignored: underscore instead of hyphen is enough to void the entire alternate.",
  },
];
