# goflag

A CLI that audits a site for broken links, missing translation pages, a robots.txt that contradicts your pages, and missing or misconfigured SEO metadata — and a Next.js library that produces the HTML it would have nothing to say about.

[![node](https://img.shields.io/badge/node-%3E%3D22-339933?logo=nodedotjs&logoColor=white)](https://github.com/tancredesimonin/goflag/blob/main/package.json)
[![license: MIT](https://img.shields.io/badge/license-MIT-green)](#license)

Goflag crawls a site once and judges what it found. It is deliberately small: no dashboard, no config system, no social-preview gallery. Just the findings, as a machine-readable report you can pipe, diff, or gate CI on.

It is built for the mistakes that are invisible while browsing and expensive in
search: a `hreflang` that points at a 404, a canonical that silently
de-indexes a page, a `robots.txt` that contradicts every `<meta name="robots">`
on the site. A human cannot check those on 400 pages. That is the whole job.

## Getting started

```sh
npx @goflag/cli https://example.com          # one-off, nothing installed
pnpm add -D @goflag/cli                      # then: pnpm goflag https://example.com
```

Install it as a dev dependency once you run it more than once — in a script, in
CI, in a git hook. `npx` is for trying it. The package is `@goflag/cli`; the
command it installs is `goflag`. Everything under the brand lives in the
`@goflag` scope; the bare `goflag` name on npm is a deprecated signpost pointing
here and carries no code.

- Node `>=22`.
- Nothing else for a static audit. Headless rendering needs Chromium, which is **not** installed with goflag — `playwright` is an optional peer dependency. Add it only if you audit client-rendered pages without `--static`: `pnpm add -D playwright && pnpm exec playwright install chromium`.
- Working in this repository instead of consuming it: `pnpm install`, then see [AGENTS.md](https://github.com/tancredesimonin/goflag/blob/main/AGENTS.md).

## What it does

- **Broken links** — scrapes every crawled page, dedupes targets globally (a footer link on 500 pages is probed once), and checks each with `HEAD`→`GET` fallback, redirect-chain/loop detection, soft-404 and anti-bot (403/429) triage. Broken links are mapped back to the pages that reference them.
- **Missing translation pages** — builds a `route × locale` matrix and flags every route that exists in one locale but is missing in another, plus hreflang reciprocity gaps (`A → B` with no `B → A`), missing `x-default`, and locale tags naming a language, script or region that does not exist. Rows are keyed by pathname, unless the site declares its translation clusters — either with `xhtml:link` in the sitemap, or with reciprocal `hreflang` between two crawled pages' `<head>`. Then those declarations decide which URLs are one page, whatever their slugs, and the run reports `diagnostics.declaredClusters`. The sitemap source survives `--coverage structural`, where the two locales of a slug-translating family are rarely both sampled; the `<head>` source needs both pages in hand and is what fixes the common site that declares properly there and nothing in its sitemap.
- **robots.txt policy** — the file is parsed to RFC 9309, not scanned: every group, every rule, every line it could not read, each with its number. goflag flags a site that forbids crawling while its pages ask to be indexed — site-wide, and now per path, which is the quiet version nothing was watching. It also reports the file that errors (a 5xx there is read as a site-wide ban), one over the 500 KiB a parser must honour, a typo that silently deletes the rule you meant to write, a redirect handing your crawl policy to another origin, and a `Sitemap:` that is not a full URL.
- **SEO metadata** — lints each page's `<head>` for the handful of mistakes that actually hurt in search and social and are invisible in a browser: missing/oversized `<title>` and description, missing/relative canonical, missing `og:title`/`og:description`/`og:image`, missing viewport, and contradictory `robots`/`googlebot`/`X-Robots-Tag` directives.
- **Open Graph, past its presence** — a declared `og:image` is judged as well as counted: relative URLs no crawler can resolve, an undeclared size (so the first share of a URL renders without the image), a shape far from the 1.91:1 the card is cropped to, a missing `og:image:alt`, and — the one no tag check can reach — whether the URL actually serves an image at all. On a translated page, `og:locale` and `og:locale:alternate` are checked against the hreflang cluster — two vocabularies for one fact, which nothing in a build keeps in step.
- **Icons** — whether anything declares one at all (nothing in a spec requires it, which is why nothing complains), whether iOS has an `apple-touch-icon` to use instead of screenshotting the page, whether the Web App Manifest and the `<head>` contradict each other about the same file, whether every declared icon answers with an image, whether a `sizes` attribute describes the file it points at (a `.ico` carrying 16, 32 and 48 declared as `48x48` advertises a third of itself), and whether the origin actually serves `/favicon.ico` — a 200 of HTML from a catch-all route does not count. Two icon lists that merely differ are the normal case and are not reported.
- **Sitemap** — whether there is one, whether it parses (an HTML error page served with a 200 reads as healthy to anything that only checks the status), whether it lists anything, and whether an index can reach its children. Each entry is judged too: a `<loc>` that is not absolute, entries on another host or another protocol, a `<lastmod>` that is not a W3C Datetime or is dated in the future, a `changefreq` or `priority` outside the values the protocol defines.
- **Where the two files meet the crawl** — the contradictions no single artefact shows. A sitemap entry that `robots.txt` forbids fetching, one whose page declares `noindex`, one whose canonical points elsewhere, one that 404s or redirects, and the indexable pages the crawl found that the sitemap never lists. Entry probing answers from the crawl and the link audit before it fetches anything, so a well-built site costs almost no extra requests — and when the caps stop it short, the finding says how many went unchecked rather than implying the rest are fine. Nothing is broken when you look at either half alone, which is why nobody finds these by reading.
- **Unreachable pages** — a page the crawl reached that answered non-2xx, or that never answered at all (timeout, reset, DNS failure — recorded as `status: 0`), is reported in `unreachablePages`. goflag asks a second time, from the back of the queue, before calling a page unreachable. Each one is an `error`-severity finding: it turns the verdict red, counts toward `--max-debt`, and fails the build even under `--fail-on error`. A page that silently dropped out of the audited set is what poisons a baseline, so it is reported rather than warned about.

**Which pages get audited.** When goflag finds a sitemap it does not audit every URL in it. It groups URLs that share a path shape — and therefore a template — into families, audits every page that stands alone, and samples three pages per family. A cap answers "how many" and never "which": on a site of thousands of pages built from thirty templates, the first 200 pages a crawl reaches are four templates out of thirty.

The trade is stated in every report rather than hidden. Template rules (`canonical.*`, `hreflang.*`, `og.image.missing`) are conclusive on a sampled family; copy rules (`title.length`, `description.length`), broken links and the translation matrix are only conclusive on the pages that were drawn. The terminal prints a `COVERAGE` line, and `diagnostics.coverage` carries `mode`, `considered`, `selected` and every sampled family with its ratio. Pass `--coverage all` to audit what the sitemap lists in order, up to `--max-pages`, which is the pre-0.2.3 behaviour.

Pages that declare a `<link rel="canonical">` pointing at another crawled page are excluded from the checks — the site has said they are duplicates, so linting them would multiply every finding by the number of filtered variants. The count is reported as `diagnostics.duplicatePages`.

**Client-rendered pages.** By default, a page whose `<head>` looks empty — no
title, no description, no canonical, no OG, no JSON-LD — is re-rendered in
headless Chromium before being judged, so a SPA is not reported as missing
everything. `--static` turns that off, including the detection: with it, a
client-rendered page is judged on its unhydrated shell.

That direction is deliberate. Static mode over-reports rather than under-reports
— the metadata is genuinely absent from the HTML a crawler receives — so it
fails loudly rather than passing quietly. It is also why `--static` is the right
default in CI: it needs no browser, and it cannot mistake a broken page for a
fine one.

## Where it runs

Two packages ship to npm from a tag, published by GitLab CI over OIDC with no stored credential: `@goflag/cli` (`v*`) and `@goflag/next` (`next-v*`). The documentation site `apps/website` runs at [goflag.tech](https://goflag.tech), with `develop.goflag.tech` alongside it, both deployed with Kamal onto the shared OVH host described in the `infrastructure` repository.

## Your first audit

Five steps, in this order. Each one is explained in full further down; this is
the sequence.

**1. Look at your site.** No flags, no gate — find out what is there.

```sh
npx @goflag/cli https://example.com
```

Expect it to be red. Almost every site that has never been audited has a
backlog, and that is not a reason to fix everything before continuing.

**2. Decide what is real.** Some findings are deliberate — a legal page that
exists in one jurisdiction, a route you chose not to translate. Tell goflag,
rather than living with noise:

```sh
npx @goflag/cli https://example.com --ignore-holes /legal
```

**3. Capture a baseline.** This freezes today's findings as "known", so the gate
can ask _did this change make it worse?_ instead of _is this site perfect?_

```sh
npx @goflag/cli https://example.com --static --no-external \
  --baseline .goflag/baseline.json --update-baseline
```

It prints how many findings it grandfathered and the `--max-debt` to set next.
Commit `.goflag/baseline.json`.

**4. Gate CI on regressions.** See [In CI](#in-ci) for a job you can copy.

```sh
goflag https://example.com --static --no-external \
  --baseline .goflag/baseline.json --regressions-only --max-debt 41
```

**5. Lower the ratchet.** Fix a finding, drop `--max-debt` by one, commit both.
This is the only part that makes the backlog shrink; without it a baseline
fossilises behind a passing build.

Steps 3 to 5 are the whole method. The rest of this README is why each flag
behaves the way it does.

You get a coloured terminal report and an exit code:

- `0` — clean (green flag)
- `1` — findings present (yellow/red flag) — use this as a CI gate
- `2` — fatal error (bad URL, unexpected failure)

## Using it

Everything below is reference: what each flag does and why it behaves that way.
The five steps above are the path; this is the map.

### JSON is the source of truth

```sh
npx @goflag/cli https://example.com --json > report.json      # print JSON to stdout
npx @goflag/cli https://example.com --report report.json      # write JSON to a file
```

The terminal view is just a render of that JSON.

### Four verbs

```sh
goflag <url> [options]     # audit a site
goflag preview <url>       # render its share cards, and look at them
goflag rules               # print the rule catalogue as JSON
goflag flags               # print the flag reference as JSON
```

The last two answer a question about goflag rather than about a site, so they
take no URL and touch no network. `preview` takes one and audits like a normal
run — [what it writes](#goflag-preview--look-at-the-cards-before-you-ship-them) is further down.

### The catalogue is data too

```sh
npx @goflag/cli rules > rules.json
```

`rules` answers a question about goflag rather than about a site: no URL, no
crawl, no network. It ships fifty-eight rules — twenty-five page rules,
twenty-eight site rules and five prose rules — and every entry carries its
scope, severity and summary. All but one also carry a rigor, the documents they
cite and, where a remedy is a line of code, a fix snippet. The exception is
`hreflang.sitemap-mismatch`, which emits `rigor: null` with an empty `sources`
because no specification says which of the two declarations is wrong; inventing
an authority there is worse than admitting the gap. Write your consumer against
that. The same document ships inside the package as `rules.json`, if you would
rather read it than run anything.

The flag list below is data too:

```sh
npx @goflag/cli flags > flags.json
```

Same idea, one step further: `flags` prints the very table `goflag --help` is
rendered from and the argument parser dispatches on, so a flag cannot exist in
one and not the other. Each entry carries its long and short forms, its argument
placeholder, its default, the group it belongs to and any flag it requires. It
ships inside the package as `flags.json` as well.

It deliberately omits the message a finding prints — that is built at audit time
from what the page actually says, so a static copy would be a sample rather than
a fact, and a sample presented as the truth is how this project's own
documentation site came to quote a message the engine had stopped printing.

### Options

```
--json                 Print the JSON report to stdout (nothing else).
--summary, -s          Roll findings up (dedup by link/rule/code). Pairs with
                       --json for a compact payload; --report always writes
                       the full report regardless. Not available with
                       --baseline: there the diff is the answer.
--report <file>        Write the JSON report to <file>.
--depth <n>            How far to follow links out of each page (0 = follow
                       none). Sitemap URLs are seeded regardless, so --depth 0
                       alone is not "entry page only" — add --no-sitemap.
                       Default: 2.
--max-pages <n>        Page budget for the crawl. Default: 200. A hard cap
                       under --coverage all; under structural coverage the
                       selection wins and the budget is max(<n>, selected + 5),
                       so a lower value cannot cut the run short.
--coverage <mode>      How pages are chosen: "structural" (default when a
                       sitemap is found) keeps every standalone page and
                       samples three pages per family of template-generated
                       pages; "all" audits what the sitemap lists, in order,
                       up to --max-pages.
--include <glob>       Only crawl paths matching <glob> (repeatable).
--exclude <glob>       Skip paths matching <glob> (repeatable).
--locales <list>       Comma-separated locales the site serves ("fr,en,pt-br").
                       Unioned with the prefixes your sitemap shows, never
                       substituted for them, so a locale the sitemap serves
                       stays on the axis whether or not you list it. Also what
                       folds /en/… and /fr/… into one route family for
                       structural coverage — pass it on any locale-prefixed
                       site.
--ignore-holes <glob>  Route deliberately not translated everywhere
                       (repeatable).
--no-sitemap           Do not discover the sitemap; crawl from <url> only.
--profile <name>       Policy overlay on the rule set: default, strict,
                       spec-only, marketing.
--conformance          Report every rule's status on every page, not just
                       the violations.
--advisories           Attach the prose rules — the judgment calls goflag
                       refuses to fake — with the facts to judge them by.
--fail-on <level>      Exit 1 at or above this severity: warning (default),
                       error, or never.
--regressions-only     Weaken the gate: fail only on NEW findings relative
                       to --baseline. Requires --baseline.
--baseline <file>      Stored report to compare against.
--update-baseline      Write this run to --baseline and exit 0, instead of
                       judging against it.
--max-debt <n>         Fail when the site carries more than <n> findings in
                       total, new or known.
--start <cmd>          Boot <cmd>, wait for <url>, audit, then stop it.
--start-cwd <dir>      Directory to run --start in. Defaults to the current
                       one.
--start-timeout <ms>   How long to wait for --start. Default: 60000.
--no-external          Do not probe off-origin (external) links.
--static               Static HTML only; never launch headless Chromium.
--allow-insecure-tls   Accept self-signed / invalid TLS (localhost, tunnels).
--timeout <ms>         Per-request timeout in ms, for page fetches and link
                       probes alike. Unset, the defaults differ: 8000 for link
                       probes, 15000 for page fetches.
--verbose, -V          Log every page as it is analyzed.
--quiet, -q            Suppress the live progress output.
--no-color             Disable coloured output.
-h, --help             Show help.
-v, --version          Show the version.
```

Headless mode needs Chromium. `playwright` is an optional peer dependency; if it's missing, install it with `npx playwright install chromium` (or just run with `--static`).

### Profiles: how much each rule matters to you

Every rule records how authoritative it is — whether a published spec requires
it, a vendor documents it, or it is widely-repeated folklore. That is a fact
about the rule, and goflag never fudges it. What your build should _do_ about
each one is a separate question, and that is what `--profile` answers:

```sh
goflag https://example.com --profile spec-only    # only what a spec backs
goflag https://example.com --profile strict       # spec-backed rules fail the build
goflag https://example.com --profile marketing    # metadata gaps are errors
```

| Profile     | What it does                                                                   |
| ----------- | ------------------------------------------------------------------------------ |
| `default`   | Each rule's own severity. No overlay.                                          |
| `strict`    | Every spec-backed rule becomes an `error`. Heuristics stay warnings.           |
| `spec-only` | Heuristic rules (title/description length) are switched off entirely.          |
| `marketing` | The snippet and unfurl metadata — description, `og:title`, `og:image` — error. |

A profile only changes how loudly a rule fires and whether it runs at all. It
never changes what a rule observes, and it never rewrites a rule's stated
authority — so `strict` can make a finding fail your build, but it cannot turn
folklore into a spec requirement.

The report records which profile produced it (`"profile": "strict"`), and the
terminal output names any non-default one. A run under `spec-only` reporting
zero issues means "nothing a spec backs is wrong here", not "nothing is wrong".

That record is load-bearing: comparing a run against a baseline captured under
a different profile still works, but "0 new findings" no longer means what it
appears to, so goflag says so rather than letting the number speak for itself:

```
REGRESSION GATE  0 new · 19 known findings NOT gating this build
baseline https://example.com — taken 2026-08-06 (today)
note: baseline was captured under profile `strict`, this run used `spec-only` — the two are not like-for-like.
```

It is a warning, never a gate — a `--profile spec-only` investigation against a
`strict` baseline is a legitimate thing to do.

### Where do we stand? (`--conformance`)

A list of violations cannot tell you the difference between a rule that
passes everywhere and a rule that never applied to a single page. Both look
like silence. `--conformance` reports every rule's status on every page:

```sh
goflag https://example.com --conformance
```

```
Conformance
  6 pages × every rule
  canonical.absolute       6 fail  [vendor-spec]
  canonical.missing        6 pass  [vendor-spec]
  description.length       6 n/a   [heuristic]
  title.missing            6 pass  [spec-required]
```

The terminal shows the tally; `--json` carries the full rule × page grid,
with each rule's rigor and sources in a legend rather than repeated per
cell. `pass + fail + warn + n/a + crashed` always equals the page count, so
the coverage claim is checkable.

### The questions goflag will not answer for you (`--advisories`)

Whether a title _describes_ the page is not a thing a linter can decide.
goflag could fake it — count words, match boilerplate, emit a confident
verdict — and the result would be unfalsifiable noise. So it states the
question, cites what makes it a real requirement, attaches the observed
facts, and stops:

```sh
goflag https://example.com --advisories --json
```

```json
{
  "ruleId": "description.accurate",
  "prose": "Does the description accurately summarize this page's content, and is it written for this page rather than copied across the site?",
  "rigor": "guideline",
  "sources": ["google-snippet", "moz-meta-description"],
  "evidence": { "meta.description": { "value": "…", "origin": { "kind": "meta" } } },
  "verdict": "needs-judgment"
}
```

Advisories are asked only where the subject exists — no question about a
description on a page that has none, because `description.missing` already
says that. They never count toward the summary, the verdict, or the exit
code: nobody has judged them yet.

### Every finding says how authoritative it is

A finding carries the rule's `rigor`, the documents behind it, what the page
actually said and what a passing page looks like — in the JSON, not only in the
opt-in conformance view:

```json
{
  "ruleId": "title.length",
  "severity": "warning",
  "rigor": "heuristic",
  "sources": ["google-title-link", "moz-title-tag"],
  "expected": "10–60 characters",
  "observed": 65
}
```

That distinction is the whole point of the rigor axis, and it is meant to be
acted on: a `spec-required` finding and a `heuristic` one are not the same
work, and a report read in CI — or by an agent that does not have the rule
registry — could not tell them apart otherwise. `--summary` shows it per rule,
where it costs one tag instead of one per finding:

```
  warn  title.length [heuristic] ×3
```

Severity says what your build should do; rigor says who says so. A profile
changes the first and never the second.

### Gate on regressions, not on perfection

A plain run fails on any finding, which is unusable on a site that is not clean
yet — so it gets switched off, or ignored. Capture a baseline once and gate on
"did this change make it worse?" instead:

```sh
goflag https://example.com --baseline baseline.json --update-baseline   # once
goflag https://example.com --regressions-only --baseline baseline.json
```

Findings are matched by fingerprint, and page URLs are normalised to
origin-independent routes — so a baseline captured against production compares
cleanly with a run against `localhost`.

**This mode passes builds on sites with known defects.** That is what it is
for, and why it has to be asked for by name: `--baseline` alone is an error.
The output never says "clean" and never goes green while findings are
outstanding — it says how many are being let through:

```
REGRESSION GATE  0 new · 108 known findings NOT gating this build
baseline https://example.com — taken 2026-07-29 (3 days ago)
```

The risk it carries is the one every suppression file carries: the backlog
fossilises behind a passing build. `--max-debt` is the counterweight — a
ceiling on total findings that you lower as you fix, so the number has to go
down rather than merely not go up:

```sh
goflag https://example.com --regressions-only --baseline baseline.json --max-debt 108
```

Keeping `baseline.json` in the repository helps for the same reason: adding a
finding to it then shows up in a diff someone reviews.

Capture it with the run that will later judge it, minus one flag:

```sh
goflag https://example.com --baseline baseline.json --update-baseline
```

That matters more than it looks. A baseline captured with different options than
the gate — a forgotten `--static`, another `--max-pages` — does not compare
cleanly, and the mismatch surfaces as findings that appear from nowhere. Using
the same command for both makes that impossible.

The same flag accepts findings you have decided to live with, and it says what
it accepted:

```
goflag: baseline updated — 3 newly accepted, 0 resolved, 44 findings now
grandfathered in baseline.json
```

Refreshing a baseline is taking on debt. It prints the number so the commit that
does it can be read as what it is.

### Gate a merge before it ships

`--start` boots your app, waits for it to answer, audits it, and stops it — so
the same checks that would have caught a regression in production run on the
branch instead:

```sh
goflag http://localhost:3000 --start "pnpm start" --fail-on error
```

The command runs in the current directory, so run goflag from the project it
should boot. In a monorepo audited from the root, point it at the package:

```sh
goflag http://localhost:3000 --start "pnpm start" --start-cwd apps/web
```

### `goflag preview` — look at the cards before you ship them

Some things are only settleable by looking. `og.image.representative` asks
whether the shared image survives being cropped to 1.91:1 — a question the
catalogue states and refuses to answer, because no rule can.

```sh
goflag preview http://localhost:3000 --start "pnpm start"
```

It audits like a normal run, then writes `.goflag/preview.html`: one
self-contained file showing what Google, Open Graph, X, LinkedIn, Slack, Discord
and WhatsApp make of each page, with the findings pinned on the cards they
concern and the page's JSON-LD shown beside them.

Each surface is labelled with how well its geometry is actually documented.
Three of the seven publish real numbers; Slack calls its own rendering a
"micro-approximation"; Discord publishes nothing; X's card documentation is not
reachable, and its shape changed twice since 2023. Drawing all seven with the
same confidence would be six unearned claims, so the file says which is which.

It never gates — it exits 0 unless the run itself failed — and it prints the
path it wrote, so `open "$(goflag preview http://localhost:3000)"` opens it.

### Multilingual sites

Discovery is seeded from the sitemap, not just from links. That matters because
a site with no `hreflang` gives a link crawler nothing to follow into its other
locales — so it would look monolingual, and every hreflang check would pass
vacuously. When a site has no usable sitemap, name the locales yourself:

```sh
goflag https://example.com --locales fr,en,pt-br
```

When a site publishes no usable sitemap and you pass no `--locales`, goflag
does **not** guess the locale axis — it reports the prefixes it saw with the
evidence for each and turns the axis-dependent checks off (holes,
`hreflang.missing`, `hreflang.sitemap-mismatch`; the reciprocity checks read the
markup and keep running). Guessing from path shape alone once turned `/cv` (a CV
page served in French) into a locale, because `cv` is a registered ISO 639-1
code, and produced 31 findings that were never real.

Pass `--locales` even when the sitemap is fine. It is the axis goflag folds when
it groups URLs into route families, so without it a site with many top-level
sections under `/en` can have those sections sampled as one family instead of
audited.

Some pages are meant to exist in one locale and not another — a
jurisdiction-specific legal notice, a post written for one market. A site has
no way to say "this page is absent on purpose", so goflag cannot tell a
deliberate gap from a forgotten translation; only you can. Declare them:

```sh
goflag https://example.com --ignore-holes /legal --ignore-holes "/blog/**"
```

Suppressed gaps are counted in `diagnostics.ignoredHoles`, so a quiet report
never means "nothing was wrong" by accident.

The opposite failure is quieter still. A cell in the matrix can be filled by an
`hreflang` on another page and by nothing else — not crawled, not listed in your
sitemap — and a filled cell reads as a translation that exists. A page
advertising a translation the site does not serve therefore plugs the very gap
it should reveal. Those cells are counted in
`diagnostics.unverifiedAlternates`, and goflag deliberately does **not** act on
them: refusing to believe an alternate the sitemap omits would invent holes on
every site using `@goflag/next`'s `sitemap: false` on purpose. Read that number
next to `missingTranslations` — a `0` beside a non-zero count is the one place
this report can be quietly wrong.

## In CI

Two moments are worth auditing, and they answer different questions.

| When                 | Against                                     | Answers                                  |
| -------------------- | ------------------------------------------- | ---------------------------------------- |
| On the merge request | the branch's own build, booted by `--start` | does **this change** regress?            |
| After deploying      | the running environment                     | is what is **actually serving** correct? |

Neither replaces the other. Only the deployed run sees what the environment
injects — the real base URL, whatever the proxy serves for `robots.txt`,
redirects. A canonical broken by a misconfigured environment variable is
invisible in a local build.

Three rules, whichever you use:

- **Pin the version.** A floating one turns someone else's release into a red
  pipeline on a commit that touched nothing, and the job is only worth having if
  red means "you broke something".
- **Commit the baseline.** Grandfathering a finding then shows up in a diff
  somebody reviews, instead of vanishing into a cache.
- **Build the same site the baseline was captured against.** Frameworks bake
  build-time environment into the output; a build that differs produces
  differences that are real in the report and meaningless as findings.

### GitLab CI

```yaml
stages: [build, deploy, audit]

variables:
  GOFLAG_VERSION: "0.2.11"

# Before the merge: build the branch, let goflag boot it, audit that.
seo:mr:
  stage: audit
  image: node:24-alpine
  rules:
    - if: $CI_MERGE_REQUEST_IID
  script:
    - corepack enable && pnpm install --frozen-lockfile
    - pnpm build
    - npx --yes "@goflag/cli@$GOFLAG_VERSION" http://localhost:3000
      --start "pnpm start" --static --no-external
      --baseline .goflag/baseline.json --regressions-only --max-debt 41
      --report goflag-report.json
  artifacts:
    when: always
    paths: [goflag-report.json]

# After the deploy: audit what is serving.
seo:
  stage: audit
  image: node:24-alpine
  needs: [{ job: deploy, artifacts: false }]
  rules:
    - if: $CI_COMMIT_BRANCH == "develop"
  script:
    - npx --yes "@goflag/cli@$GOFLAG_VERSION" https://develop.example.com
      --static --no-external
      --baseline .goflag/baseline.json --regressions-only --max-debt 41
      --report goflag-report.json
  artifacts:
    when: always
    paths: [goflag-report.json]
```

### GitHub Actions

```yaml
name: seo
on: [pull_request]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: corepack enable && pnpm install --frozen-lockfile
      - run: pnpm build
      - run: |
          npx --yes @goflag/cli@0.2.11 http://localhost:3000 \
            --start "pnpm start" --static --no-external \
            --baseline .goflag/baseline.json --regressions-only --max-debt 41 \
            --report goflag-report.json
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: goflag-report
          path: goflag-report.json
```

### Why `--static --no-external` in CI

`--static` needs no browser, so the job runs on a plain Node image and cannot
be slowed by a Chromium download. `--no-external` skips off-origin links, which
are the ones you cannot fix and whose failures are somebody else's outage — a
gate that goes red because a third party is down teaches people to ignore it.

Audit external links on a schedule instead, where nobody is waiting.

### Reading a red build

The report artefact is the thing to open. It is the same JSON as `--json`, and
it is kept whether the job passed or failed, because it is most wanted when it
is red.

If the finding is one you have decided to accept, refresh the baseline with the
same command minus `--regressions-only`, plus `--update-baseline`. It will tell
you what it accepted, and that number belongs in the commit message.

## Programmatic API

```ts
import { runAudit } from "@goflag/cli";

const report = await runAudit("https://example.com", { depth: 2 });
console.log(report.summary);
// { brokenLinks, missingTranslations, seoIssues, siteIssues, unreachablePages, verdict }
```

`runAudit` returns the same `GoflagReport` object the CLI emits.

## Repository layout

```
packages/cli/      @goflag/cli, the CLI (installs the `goflag` command)
packages/next/     @goflag/next, the Next.js library (see below)
packages/og/       @goflag/og, the share cards and the favicon container
apps/website/      goflag.tech, the landing page and the documentation
tools/name-holder/ the bare `goflag` name on npm, a signpost to @goflag/cli
```

That is the whole tree. Neither `packages/next` nor `apps/**` may import from
the CLI: the two products stay independently useful, and an ESLint rule
enforces it rather than trusting memory.

## The other half: `@goflag/next`

goflag tells you what is wrong. It does not tell you how to stop writing it
wrong. [`@goflag/next`](https://github.com/tancredesimonin/goflag/tree/main/packages/next) is a route registry for the Next.js App
Router that produces the HTML this auditor would have nothing to say about.

```ts
export const routes = site.routes({
  home: { path: "" },
  docs: collection(allDocs, { path: (d) => `/docs/${d.slug}`, locale: "en" }),
});

// app/sitemap.ts
export default () => routes.sitemap();
```

A sitemap derived separately from the metadata is two derivations of one truth,
held in agreement by vigilance, and their disagreement is what goflag reports as
`hreflang.sitemap-mismatch`. Projecting both from one registry makes that
finding unrepresentable. Full documentation at
[goflag.tech/docs/next](https://goflag.tech/docs/next), and the API reference in
[`packages/next/README.md`](https://github.com/tancredesimonin/goflag/blob/main/packages/next/README.md).

## The picture: `@goflag/og`

Two of this catalogue's rules had no remedy to point at. `og.image.missing`
fired 24 times on one site and `og.image.alt` 46 times on another, and the fix
for both is "either an asset or a route you have to write" — which is how a rule
becomes permanent debt. [`@goflag/og`](packages/og) is that route, written once.

```tsx
// app/[locale]/opengraph-image.tsx
const image = ogImage(og, async ({ params }) => {
  const { locale } = await params;
  return { title: t("hero.title"), alt: t("meta.ogAlt") };
});

export const generateImageMetadata = image.generateImageMetadata;
export default image.render;
```

The core renders nothing: it returns a JSX tree that `next/og` — which already
embeds satori — turns into a PNG at build time, so nothing installs a second
renderer and a card can be unit-tested with no framework build. It also packs
the `favicon.ico` **no Next convention emits**, guarded so that a generated file
living in git is not dirtied by every commit. API reference in
[`packages/og/README.md`](packages/og/README.md).

## Develop locally

Requires pnpm, pinned via `packageManager` in the root `package.json` — run
`corepack enable` once and it picks up the right version by itself. Run these
from the repository root:

```sh
pnpm install
pnpm dev https://example.com   # run the CLI from source (tsx)
pnpm build                     # bundle to dist/ (tsup)
pnpm test                      # vitest (unit + integration)
pnpm test:unit                 # unit only (no network / Chromium)
pnpm test:integration          # fixture-server + headless Chromium
pnpm lint                      # eslint
pnpm typecheck                 # tsc --noEmit
pnpm format                    # prettier
```

`format` and `format:check` run once over the whole repository. `lint` runs
eslint once at the root and then fans out to any package that defines its own
`lint` script — `apps/website` does, with the Next config — and the rest fan out
across workspace packages with `pnpm -r`. To work on one package, filter:
`pnpm --filter @goflag/cli test`.

The engine is framework-agnostic and lives in [`packages/cli/src/lib/core/`](https://github.com/tancredesimonin/goflag/tree/main/packages/cli/src/lib/core) (crawl, fetch/extract, link audit, i18n) and [`packages/cli/src/lib/rules/`](https://github.com/tancredesimonin/goflag/tree/main/packages/cli/src/lib/rules) (SEO checks). The CLI shell — orchestration, the `GoflagReport` schema, and rendering — lives in [`packages/cli/src/report/`](https://github.com/tancredesimonin/goflag/tree/main/packages/cli/src/report) and [`packages/cli/src/cli.ts`](https://github.com/tancredesimonin/goflag/blob/main/packages/cli/src/cli.ts).

## Contributing

GitHub is a read-only mirror; the canonical repository and the CI are on GitLab,
so a pull request opened here cannot be merged. **Issues are the useful thing to
open on GitHub** — a wrong finding especially, which is the class of bug handled
first. [CONTRIBUTING.md](https://github.com/tancredesimonin/goflag/blob/main/CONTRIBUTING.md)
has the whole story, including what makes a report reproducible and what a rule
proposal needs. Vulnerabilities go to <hello@goflag.tech> rather than to an
issue — see
[SECURITY.md](https://github.com/tancredesimonin/goflag/blob/main/SECURITY.md).

## License

MIT.

## Learn more

- Strategy and goals: [STRATEGY.md](https://github.com/tancredesimonin/goflag/blob/main/STRATEGY.md)
- What comes next: [ROADMAP.md](https://github.com/tancredesimonin/goflag/blob/main/ROADMAP.md)
- Working in this repository (human or agent): [AGENTS.md](https://github.com/tancredesimonin/goflag/blob/main/AGENTS.md)
- The overall development plan: [docs/spec-and-lib-plan.md](https://github.com/tancredesimonin/goflag/blob/main/docs/spec-and-lib-plan.md)
- The rule catalogue and its architecture: [docs/rules-catalog-plan.md](https://github.com/tancredesimonin/goflag/blob/main/docs/rules-catalog-plan.md)
- Publishing `@goflag/next`: [docs/publishing.md](https://github.com/tancredesimonin/goflag/blob/main/docs/publishing.md)
