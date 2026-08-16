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
  "og.image.reachable": {
    why: "Every other check on a preview image judges the tag; this one judges the file. It is the only one that catches the failure with no symptom — a URL present, well-formed, absolute, and dead. Found on this project's own documentation, where the cards pointed at a route a redirect had been swallowing since the day it was written.",
    message:
      "`og:image` does not serve an image: HTTP 200 with `text/html`, which is not an image. The preview card will render without it.",
  },
  "icons.unreachable": {
    why: "An icon that 404s is worse than one never declared: the client asks, gets nothing, and has already skipped the `/favicon.ico` it would otherwise have fallen back to. Declaring it is what took the fallback away.",
    message: "Declared icon does not serve an image: `icon` → `/icon-32.png` (HTTP 404).",
  },
  "icons.sizes-mismatch": {
    why: "`sizes` exists so a client can pick one icon out of several without fetching them all. A wrong value costs exactly what the attribute was there to save. The usual shape is not a lie but a half-truth: a `.ico` carrying 16, 32 and 48 declared as `48x48` advertises a third of itself.",
    message:
      "`sizes` does not describe the file: `/favicon.ico` declares `48x48` and contains 16x16, 32x32, 48x48.",
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
    why: "This is the blind spot goflag was built to close. Without alternates, an engine cannot tell four translations of a page from four competing pages, so they consolidate nothing and split each other's authority. Google is explicit that a cluster whose pages do not all point at each other is not weakened but ignored outright, which is why this is an error rather than a warning even though no web standard requires the tags at all.",
    message:
      "Page declares no `hreflang` alternates, but the site serves 4 locales (en, es, fr, pt-br, per the sitemap). Locale variants of this route cannot be associated with each other.",
  },
  "hreflang.cluster-incomplete": {
    why: "Listing a URL in your sitemap is you saying that version exists and should be indexed. Leaving it out of the hreflang cluster then puts it outside the group it belongs to, so it competes with its own translations instead of consolidating with them — which is the one thing hreflang exists to prevent. Google requires every version to list every other, and the sitemap is your own evidence that the missing one is real.",
    message:
      "Route `/pricing`: the sitemap lists es, pt-br but the `<head>` does not advertise them. The site publishes those versions and leaves them outside the cluster, so they compete with this page instead of consolidating with it.",
  },
  "hreflang.sitemap-mismatch": {
    why: "The head and the sitemap are two declarations of one intent, produced by different code paths, so they drift. This is the direction no specification covers: nothing requires an hreflang-declared page to appear in a sitemap, and a page deliberately kept out of it is doing nothing wrong. So goflag stopped calling it a defect and started asking about it — you get both lists and the question, and you decide which of your two generators is wrong.",
  },
  "sitemap.entry.unreachable": {
    why: "A sitemap is a list of pages you want indexed, so every dead entry spends crawl budget on a promise the site does not keep. The count is a floor when the caps stopped the pass short, and the message says so rather than implying the rest are fine.",
    message:
      "4 sitemap entries do not answer: `https://example.com/old` (HTTP 404), `https://example.com/gone` (HTTP 410). A sitemap is a list of pages to index, so every dead entry spends crawl budget on a promise the site does not keep.",
  },
  "sitemap.entry.redirects": {
    why: "Google asks for final URLs. Every hop is crawl budget spent, plus one more chance for a consumer to disagree with you about which address is the page — which is the same argument the canonical rules make, arriving from the other direction.",
    message:
      "3 sitemap entries redirect: `https://example.com/a → https://example.com/a/`. Google asks for the final URL, and every hop is crawl budget spent plus one more chance for a consumer to disagree about which address is the page.",
  },
  "sitemap.entry.blocked-by-robots": {
    why: "The sitemap says index this and robots.txt says never fetch it. Both are the same site speaking, and robots.txt is the one that decides — so the entry is not merely ignored, it is an instruction the site contradicts a line later.",
    message:
      '3 sitemap entries are disallowed by `robots.txt`: `https://example.com/admin/a`, `https://example.com/admin/b`. The sitemap says "index this" and robots.txt says "never fetch it" — both cannot hold, and robots.txt is the one that decides.',
  },
  "sitemap.entry.noindex": {
    why: '"Please index this" and "do not index this" are one site\'s two answers to one question. Only judged on pages the crawl actually fetched: an entry goflag never opened has no `noindex` to have seen, and guessing either way would invent a finding or hide one.',
    message:
      '2 sitemap entries declare `noindex`: `https://example.com/draft`. "Please index this" and "do not index this" are the same site\'s two answers to one question.',
  },
  "sitemap.entry.non-canonical": {
    why: 'The sitemap is the list of what you want indexed, so it should name the URL you actually prefer. Listing a variant that points elsewhere spends crawl budget arriving at a page that immediately says "not me".',
    message:
      "1 sitemap entry names a page whose canonical points elsewhere: `https://example.com/a?ref=x → https://example.com/a`. The sitemap is a list of what to index, so it should name the URL the site itself prefers.",
  },
  "sitemap.orphans": {
    why: "One finding with a count and a sample rather than one per page: the omission belongs to the sitemap, not to each page it forgot. A consumer that reads the sitemap instead of following links never sees them, and link-only discovery is the part of a site nobody audits.",
    message:
      "7 crawled pages ask to be indexed and are absent from the sitemap: `https://example.com/blog/a`, `https://example.com/blog/b`. A consumer that reads the sitemap rather than following links will never see them.",
  },
  "sitemap.missing": {
    why: "Without one, discovery depends entirely on what links to what — the part of a site nobody audits. A warning rather than an error: a small, fully linked site genuinely may not need a sitemap, and saying otherwise would be inventing a rule.",
    message:
      "No sitemap was found — not declared in `robots.txt`, and not at a well-known path. Discovery then depends entirely on what links to what, which is the part of a site nobody audits.",
  },
  "sitemap.unparsable": {
    why: "The usual cause is an HTML error page answered with a 200, which reads as a perfectly healthy sitemap to anything that only checks the status code. The file is present, the request succeeds, and the inventory is empty.",
    message:
      "A sitemap was served but does not parse as XML. The usual cause is an HTML error page answered with a 200 — which reads as a healthy sitemap to anything that only checks the status.",
  },
  "sitemap.empty": {
    why: "goflag falls back to crawling, so the audit survives. A search engine does not fall back: it reads the file it was pointed at, finds nothing, and moves on.",
    message:
      "The sitemap parses and lists no URLs, while the crawl found 42. goflag falls back to crawling — a consumer that trusts the sitemap has nothing to read.",
  },
  "sitemap.index.child-error": {
    why: "An index declares an inventory, and part of it is unreachable. Whatever those documents listed is invisible — and because they are the thing that would have said what, nothing reports how much was lost.",
    message:
      "2 of 9 child sitemaps could not be read. The index declares an inventory and part of it is missing, so whatever those documents listed is invisible — and nothing says how much that is.",
  },
  "sitemap.limits.exceeded": {
    why: "A consumer is entitled to stop reading at 50,000 URLs or 50 MB, so everything past the ceiling is published in name only. Nothing about the failure is visible from outside: the file serves, it parses, and the entries beyond the cut are simply never crawled. The size is measured uncompressed, because the limit is about what a consumer must parse rather than what crossed the wire.",
    message:
      "This sitemap document declares 61,204 URLs against a ceiling of 50,000. A consumer may stop reading at the limit, so everything past it is published in name only — split the document and reference the parts from an index.",
  },
  "sitemap.entry.out-of-scope": {
    why: "A sitemap only speaks for the directory it is served from: one at `/catalog/sitemap.xml` may list URLs under `/catalog/` and not under `/images/`. A root-level sitemap is exempt by construction, which is most of them — this catches the sites that split sitemaps per section and serve each from its own section, then let one drift outside its own patch.",
    message:
      "3 entries are outside this sitemap's directory `/catalog/`: `https://example.com/images/a`, `https://example.com/images/b`, `https://example.com/blog/c`. A sitemap only speaks for the path it is served from, so a consumer may drop them — serve the document from the root, or move the entries into a sitemap that covers them.",
  },
  "sitemap.entry.invalid-url": {
    why: "A sitemap is fetched on its own, with no page behind it, so a relative `<loc>` resolves to nothing. The entry looks like a declaration and names no address.",
    message:
      "2 `<loc>` values are not an absolute URL: `/about`, `/pricing`. A sitemap is fetched on its own, so a consumer has nothing to resolve them against.",
  },
  "sitemap.entry.cross-host": {
    why: "`www` and the apex are different hosts to a consumer, and this is what catches the sitemap generated against one and served on the other. A consumer may drop every entry that does not belong to the host it fetched the file from.",
    message:
      "12 entries name hosts other than this sitemap's: `https://www.example.com/a`, `https://www.example.com/b`. A consumer may drop them — the sitemap only speaks for the host that serves it.",
  },
  "sitemap.entry.protocol-mismatch": {
    why: "One of the two sets names pages the site does not serve at those addresses, and nothing in the file says which. Usually the residue of a migration that updated the pages and not the generator.",
    message:
      "The sitemap lists both http and https URLs. One of the two sets names pages the site does not serve at those addresses, and a consumer has no way to tell which.",
  },
  "sitemap.lastmod.invalid": {
    why: "Google stops trusting the field entirely once it finds values it cannot use — so one bad batch costs the whole site a signal it was paying to produce. Future dates count: a date that has not happened cannot describe a change that has.",
    message:
      "`<lastmod>` values a consumer cannot use: 3 not a W3C Datetime (`March 4 2026`). Google ignores the field entirely when it stops trusting it, so one bad batch costs the whole site the signal.",
  },
  "sitemap.field.invalid": {
    why: "Both fields are ignored by Google either way, so a wrong value costs nothing directly. It is reported because a value outside the protocol is a generator that was never checked — and the same generator writes the `<loc>` values that do matter.",
    message:
      "1 entry carries a field outside the protocol's values: https://example.com/a — priority `1.5`. Google ignores both fields either way — so this is worth fixing or deleting, never worth trusting.",
  },
  "robots.blocks-page": {
    why: "The quiet version of the site-wide block. A `Disallow` added years ago for a reason that made sense then, still shadowing a section that has since been given pages asking to be found. Nothing in a browser shows it: the page loads perfectly for you and is never fetched by a crawler.",
    message:
      'Page declares `<meta name="robots" content="index">` but `robots.txt` line 4 disallows `/blog` for `*`. robots.txt wins: the page is never fetched, so the tag asking for it is never read.',
  },
  "robotstxt.unreachable": {
    why: "The failure mode nobody plans for: a 500 on one small text file is read as a site-wide ban. RFC 9309 is explicit — while robots.txt errors, a crawler must assume complete disallow. An outage here costs more than an outage on any page.",
    message:
      "`robots.txt` could not be read: the origin answered 503. RFC 9309 §2.3.1.4 tells a crawler to assume a complete disallow for as long as this lasts — an outage on this one file takes the whole site out of the index.",
  },
  "robotstxt.oversized": {
    why: "Parsers are only required to read the first 500 KiB. Past that, rules are not wrong, they are absent — and a file that long is usually generated, so nobody scrolls to the end to notice.",
    message:
      "`robots.txt` is 812 KiB. A parser is only required to honour the first 500 KiB (RFC 9309 §2.4), so every rule past that point silently does not exist.",
  },
  "robotstxt.invalid-line": {
    why: "A typo in robots.txt does not fail loudly, it fails as silence: the crawler drops the line and the rule you meant to write simply never existed. `Disalow:` looks right at a glance and protects nothing.",
    message:
      "`robots.txt` has 1 line that parses as nothing: line 2 (unknown directive `disalow`). A crawler drops them silently, so the rule you meant to write is simply absent.",
  },
  "robotstxt.unknown-directive": {
    why: "Not a defect — `Crawl-delay` and `Host` are spelled correctly and some crawlers honour them. Worth knowing because Google does not, so a site relying on one for rate limiting is relying on nothing where it matters most.",
    message:
      "`robots.txt` uses `crawl-delay`, which RFC 9309 does not define. Some crawlers honour it and Google ignores it — so this is worth knowing, not necessarily worth changing.",
  },
  "robotstxt.cross-origin": {
    why: "Legal, and almost always accidental. Following the redirect is permitted, but the policy governing this site now lives on a host this site does not control — and the day that host answers differently, nobody here will know why the traffic changed.",
    message:
      "`robots.txt` redirects to `https://cdn.example.net/robots.txt`, on another origin. RFC 9309 §2.3.1.2 permits following it, so this works — but the policy for this site now lives somewhere this site does not control, and it is usually a proxy accident rather than a decision.",
  },
  "robotstxt.sitemap.relative": {
    why: "robots.txt is fetched on its own, so a consumer has no page to resolve a relative path against. The declaration reads as an instruction and resolves to nothing.",
    message:
      "`Sitemap:` must be a full URL: line 3 declares `/sitemap.xml`. robots.txt is fetched on its own, so there is no page for a consumer to resolve a relative path against.",
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
