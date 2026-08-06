# Goflag

> **A lean CLI that flags the site problems humans can't catch at scale.**
> Point it at a URL and get four things: broken links, missing translation pages, a robots.txt that contradicts your pages, and missing or misconfigured SEO metadata. JSON-first.

[![node](https://img.shields.io/badge/node-%3E%3D22-339933?logo=nodedotjs&logoColor=white)](./package.json)
[![license: MIT](https://img.shields.io/badge/license-MIT-green)](#license)

Goflag crawls a site once and judges what it found. It is deliberately small: no dashboard, no config system, no social-preview gallery. Just the findings, as a machine-readable report you can pipe, diff, or gate CI on.

It is built for the mistakes that are invisible while browsing and expensive in
search: a `hreflang` that points at a 404, a canonical that silently
de-indexes a page, a `robots.txt` that contradicts every `<meta name="robots">`
on the site. A human cannot check those on 400 pages. That is the whole job.

## What it checks

- **Broken links** — scrapes every crawled page, dedupes targets globally (a footer link on 500 pages is probed once), and checks each with `HEAD`→`GET` fallback, redirect-chain/loop detection, soft-404 and anti-bot (403/429) triage. Broken links are mapped back to the pages that reference them.
- **Missing translation pages** — builds a `route × locale` matrix from the crawl and flags every route that exists in one locale but is missing in another, plus hreflang reciprocity gaps (`A → B` with no `B → A`), missing `x-default`, and invalid locale tags.
- **robots.txt policy** — flags a site that forbids crawling while its pages ask to be indexed. The two declarations cannot both hold, and robots.txt wins, so the meta tag is never even read.
- **SEO metadata** — lints each page's `<head>` for the handful of mistakes that actually hurt in search and social and are invisible in a browser: missing/oversized `<title>` and description, missing/relative canonical, missing `og:title`/`og:description`/`og:image`, missing viewport, and contradictory `robots`/`googlebot`/`X-Robots-Tag` directives.

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

## Install

Requires Node `>=22`.

```sh
npx @goflag/cli https://example.com          # one-off, nothing installed
pnpm add -D @goflag/cli                      # then: pnpm goflag https://example.com
```

Install it as a dev dependency once you run it more than once — in a script, in
CI, in a git hook. `npx` is for trying it.

The package is `@goflag/cli`; the command it installs is `goflag`. Everything
under the brand lives in the `@goflag` scope; the bare `goflag` name on npm is a
deprecated signpost pointing here and carries no code.

Headless rendering needs Chromium, which is **not** installed with goflag —
`playwright` is an optional peer dependency. Add it only if you audit
client-rendered pages without `--static`:

```sh
pnpm add -D playwright && pnpm exec playwright install chromium
```

## Getting started

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

### Options

```
--json                 Print the JSON report to stdout (nothing else).
--report <file>        Write the JSON report to <file>.
--depth <n>            Crawl depth (0 = entry page only). Default: 2.
--max-pages <n>        Hard cap on pages crawled. Default: 200.
--include <glob>       Only crawl paths matching <glob> (repeatable).
--exclude <glob>       Skip paths matching <glob> (repeatable).
--locales <list>       Comma-separated locales the site serves ("fr,en,pt-br").
--ignore-holes <glob>  Route deliberately not translated everywhere
                       (repeatable).
--no-sitemap           Do not discover the sitemap; crawl from <url> only.
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
--timeout <ms>         Per-request timeout in ms. Default: 8000.
--no-color             Disable coloured output.
-h, --help             Show help.
-v, --version          Show the version.
```

Headless mode needs Chromium. `playwright` is an optional peer dependency; if it's missing, install it with `npx playwright install chromium` (or just run with `--static`).

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
evidence for each and turns the i18n checks off. Guessing from path shape alone
once turned `/cv` (a CV page served in French) into a locale, because `cv` is a
registered ISO 639-1 code, and produced 31 findings that were never real.

Some pages are meant to exist in one locale and not another — a
jurisdiction-specific legal notice, a post written for one market. A site has
no way to say "this page is absent on purpose", so goflag cannot tell a
deliberate gap from a forgotten translation; only you can. Declare them:

```sh
goflag https://example.com --ignore-holes /legal --ignore-holes "/blog/**"
```

Suppressed gaps are counted in `diagnostics.ignoredHoles`, so a quiet report
never means "nothing was wrong" by accident.

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
  GOFLAG_VERSION: "0.1.4"

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
          npx --yes @goflag/cli@0.1.4 http://localhost:3000 \
            --start "pnpm start" --static --no-external \
            --baseline .goflag/baseline.json --regressions-only --max-debt 41
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
console.log(report.summary); // { brokenLinks, missingTranslations, seoIssues, verdict }
```

`runAudit` returns the same `GoflagReport` object the CLI emits.

## Repository layout

```
packages/cli/      @goflag/cli — the CLI (installs the `goflag` command)
tools/name-holder/ the bare `goflag` name on npm, a signpost to @goflag/cli
```

That is the whole tree. `@goflag/next` (the Next.js library) and the
documentation site are planned but deliberately absent: the workspace globs
(`packages/*`, `apps/*`) are ready for them, and empty stubs for things that do
not exist are how a repository accumulates code nobody calls.

When they land, they must not import from the CLI: the two products stay
independently useful, and an ESLint rule enforces it rather than trusting
memory.

## Develop locally

Requires pnpm `11.18.0` (pinned via `packageManager` — `corepack enable` picks
it up). Run these from the repository root:

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

`lint`, `format` and `format:check` run once over the whole repository; the
rest fan out across workspace packages with `pnpm -r`. To work on one package,
filter: `pnpm --filter @goflag/cli test`.

The engine is framework-agnostic and lives in [`packages/cli/src/lib/core/`](packages/cli/src/lib/core) (crawl, fetch/extract, link audit, i18n) and [`packages/cli/src/lib/rules/`](packages/cli/src/lib/rules) (SEO checks). The CLI shell — orchestration, the `GoflagReport` schema, and rendering — lives in [`packages/cli/src/report/`](packages/cli/src/report) and [`packages/cli/src/cli.ts`](packages/cli/src/cli.ts).

## License

MIT.
