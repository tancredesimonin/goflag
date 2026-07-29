# Goflag

> **A lean CLI that flags the site problems humans can't catch at scale.**
> Point it at a URL and get three things: broken links, missing translation pages, and missing/misconfigured SEO metadata. JSON-first.

[![node](https://img.shields.io/badge/node-%3E%3D20.11-339933?logo=nodedotjs&logoColor=white)](./.nvmrc)
[![license: MIT](https://img.shields.io/badge/license-MIT-green)](#license)

Goflag crawls a site once and runs three focused static checks over it. It is deliberately small: no dashboard, no config system, no social-preview gallery. Just the findings, as a machine-readable report you can pipe, diff, or gate CI on.

## What it checks

- **Broken links** — scrapes every crawled page, dedupes targets globally (a footer link on 500 pages is probed once), and checks each with `HEAD`→`GET` fallback, redirect-chain/loop detection, soft-404 and anti-bot (403/429) triage. Broken links are mapped back to the pages that reference them.
- **Missing translation pages** — builds a `route × locale` matrix from the crawl and flags every route that exists in one locale but is missing in another, plus hreflang reciprocity gaps (`A → B` with no `B → A`), missing `x-default`, and invalid locale tags.
- **robots.txt policy** — flags a site that forbids crawling while its pages ask to be indexed. The two declarations cannot both hold, and robots.txt wins, so the meta tag is never even read.
- **SEO metadata** — lints each page's `<head>` for the handful of mistakes that actually hurt in search and social and are invisible in a browser: missing/oversized `<title>` and description, missing/relative canonical, missing `og:title`/`og:description`/`og:image`, missing viewport, and contradictory `robots`/`googlebot`/`X-Robots-Tag` directives.

SPA support is built in: pages that look client-rendered are re-rendered in headless Chromium automatically (pass `--static` to skip it).

## Quick start

Requires Node `>=20.11`.

```sh
npx goflag https://example.com
```

You get a coloured terminal report and an exit code:

- `0` — clean (green flag)
- `1` — findings present (yellow/red flag) — use this as a CI gate
- `2` — fatal error (bad URL, unexpected failure)

### JSON is the source of truth

```sh
npx goflag https://example.com --json > report.json      # print JSON to stdout
npx goflag https://example.com --report report.json      # write JSON to a file
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

Headless mode needs Chromium. It ships as an optional dependency; if it's missing, install it with `npx playwright install chromium` (or just run with `--static`).

### Gate on regressions, not on perfection

A plain run fails on any finding, which is unusable on a site that is not clean
yet — so it gets switched off, or ignored. Capture a baseline once and gate on
"did this change make it worse?" instead:

```sh
goflag https://example.com --report baseline.json --json          # once
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

## Programmatic API

```ts
import { runAudit } from "goflag";

const report = await runAudit("https://example.com", { depth: 2 });
console.log(report.summary); // { brokenLinks, missingTranslations, seoIssues, verdict }
```

`runAudit` returns the same `GoflagReport` object the CLI emits.

## Develop locally

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

The engine is framework-agnostic and lives in [`src/lib/core/`](src/lib/core) (crawl, fetch/extract, link audit, i18n) and [`src/lib/rules/`](src/lib/rules) (SEO checks). The CLI shell — orchestration, the `GoflagReport` schema, and rendering — lives in [`src/report/`](src/report) and [`src/cli.ts`](src/cli.ts).

## License

MIT.
