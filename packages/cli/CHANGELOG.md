# Goflag changelog

All notable changes to this project will be documented in this file. See [Conventional Commits](https://www.conventionalcommits.org/) for commit guidelines.

## [0.2.2](https://github.com/tancredesimonin/goflag/compare/v0.2.1...v0.2.2) (2026-08-09)


### Bug Fixes

* **cli:** create the directory a --baseline or --report path names ([3489c09](https://github.com/tancredesimonin/goflag/commit/3489c09604eec31099fbc6848fb4a0542062c701))

## [0.2.1](https://github.com/tancredesimonin/goflag/compare/v0.2.0...v0.2.1) (2026-08-08)


### Bug Fixes

* **i18n:** fold locale tags to one identity, as BCP 47 says they are ([7ec450f](https://github.com/tancredesimonin/goflag/commit/7ec450f60bb70cddfde5ab8954e20f42db7784ed))

## [0.2.0](https://github.com/tancredesimonin/goflag/compare/v0.1.4...v0.2.0) (2026-08-06)


### ⚠ BREAKING CHANGES

* **rules:** the exported `Rule` contract is entirely new. `check(ctx)` and `appliesTo` are gone, replaced by `evaluate(extraction)` returning a verdict, and `summary` is now `title`. Code importing the rule types from `@goflag/cli` must be updated; the CLI itself, its JSON report and its exit codes are unaffected.

### Features

* **cli:** add --conformance and --advisories ([027c973](https://github.com/tancredesimonin/goflag/commit/027c9730715ca3e3870aeb7c28c4dd7fe599dc72))
* **cli:** add --profile, a policy overlay over the rule set ([07a6d00](https://github.com/tancredesimonin/goflag/commit/07a6d00f75a17699781b044b9cecca43c34b4942))
* **rules:** add the versioned extraction model rules read instead of HTML ([ef3bdd8](https://github.com/tancredesimonin/goflag/commit/ef3bdd8f49d442748dcdffc2e14bcad653e54f13))
* **rules:** ground every rule in a cited source of truth ([c5c44e3](https://github.com/tancredesimonin/goflag/commit/c5c44e387657752148f874257d215d12eb94613a))
* **rules:** rebuild the engine on sourced descriptors ([155a0a1](https://github.com/tancredesimonin/goflag/commit/155a0a1863fb16e50d2f6a103c5e63df840514d2))
* **website:** draw the checks literally, tab installs per package manager, drop em-dashes ([264b4ea](https://github.com/tancredesimonin/goflag/commit/264b4ea1c738c10eae580a69e388d67147abb09f))
* **website:** make the hero a diagram of the audit, switchable per pass ([bb1b179](https://github.com/tancredesimonin/goflag/commit/bb1b179d51c0c068f3ddcd6dd533c4c502357b3a))
* **website:** make the landing scannable and stop underselling ([811d8b7](https://github.com/tancredesimonin/goflag/commit/811d8b7909da2d6a45ff3758f938d4454488f7dc))
* **website:** publish the landing page, documentation and changelog ([f1b330e](https://github.com/tancredesimonin/goflag/commit/f1b330e3eeaa414250461dea9dc51621b844c8b4))
* **website:** say everything once and let the hero cards show instead of tell ([f3e4de3](https://github.com/tancredesimonin/goflag/commit/f3e4de3937c492a2265cf7035caaf1a78630b193))
* **website:** split legal pages per document and refine the hero diagram ([38ee25f](https://github.com/tancredesimonin/goflag/commit/38ee25fcf8d57f270de1c8795989b6f9d16a32b4))


### Bug Fixes

* **ci:** give the website build the two things only CI withholds ([b868a05](https://github.com/tancredesimonin/goflag/commit/b868a05142c935bcb085df01730c2743b4fab2e1))
* **ci:** stop failing the source check on someone else's outage ([7b13113](https://github.com/tancredesimonin/goflag/commit/7b13113ee06347493e550114f6c5237186c65c86))
* **website:** clear the three high advisories the site brought in ([1f9595f](https://github.com/tancredesimonin/goflag/commit/1f9595fde6531ee0aec061a89f61672229cca6d3))


### Documentation

* document rigor, profiles and the two new report sections ([3eebd53](https://github.com/tancredesimonin/goflag/commit/3eebd53d2ebe9ef02c75b0bff57e3e2f8702c8f8))
* make the README a path from install to a gated pipeline ([54bfe54](https://github.com/tancredesimonin/goflag/commit/54bfe54dc43e02445831aae81d3743ecd1567a14))
* spec the sitemap/robots artefact layer and slot it as Phase G ([7eef112](https://github.com/tancredesimonin/goflag/commit/7eef112cbe4ea09ee290acc65a396cd5365aae87))

## [0.1.4](https://github.com/tancredesimonin/goflag/compare/v0.1.3...v0.1.4) (2026-08-04)


### Features

* **cli:** capture a baseline with the command that will judge it ([bfbebca](https://github.com/tancredesimonin/goflag/commit/bfbebcad009c33bcb78a7a2822eacb8883e84e52))


### Bug Fixes

* **ci:** release only when the published surface moved ([919b590](https://github.com/tancredesimonin/goflag/commit/919b59051a66c09ddef48a6b16f9534b0b9a8666))


### Documentation

* correct the README for the monorepo and the published name ([e50ce53](https://github.com/tancredesimonin/goflag/commit/e50ce53c85d6ebfcd44235439e6bcc85045e7207))
* **plan:** record how distribution actually shipped ([5315126](https://github.com/tancredesimonin/goflag/commit/5315126cbadc598c0f2f4042cf94b44a072f61a4))

## [0.1.3](https://github.com/tancredesimonin/goflag/compare/v0.1.2...v0.1.3) (2026-08-02)


### Bug Fixes

* **ci:** stop the tag pipeline dying on an override with no job left ([5fed36a](https://github.com/tancredesimonin/goflag/commit/5fed36a33f5053c622f2c115140f31e88f2d9e7d))
* **dist:** drop the ./ from bin, which npm 11 now deletes outright ([d285116](https://github.com/tancredesimonin/goflag/commit/d2851166a4e7171835872bb23cb12a2216f3b986))


### Documentation

* **og:** plan OG images as the remedy to a rule we already ship ([80348c4](https://github.com/tancredesimonin/goflag/commit/80348c4121cce737f94d7535cf93ac034c1a282f))
* refresh AGENTS.md for the monorepo and pnpm 11 ([6f77c79](https://github.com/tancredesimonin/goflag/commit/6f77c79cf086d4c96e1b3c868d6370b70f244651))

## [0.1.2](https://github.com/tancredesimonin/goflag/compare/v0.1.1...v0.1.2) (2026-08-02)


### Bug Fixes

* **ci:** stop tag pipelines dying on a cross-project include ([aeb1683](https://github.com/tancredesimonin/goflag/commit/aeb1683200e0d3e40999419d880f356eb8bb753a))

## [0.1.1](https://github.com/tancredesimonin/goflag/compare/v0.1.0...v0.1.1) (2026-08-02)


### Bug Fixes

* **ci:** keep playwright and its image in lockstep, and fail when they drift ([c637fa0](https://github.com/tancredesimonin/goflag/commit/c637fa039a8a196ba9bf045f4792a64a8aa14778))
* **ci:** stop the release guard inverting itself on a match ([d597fe5](https://github.com/tancredesimonin/goflag/commit/d597fe5334fdf1953e6252bc7dd863900e247696))
* **deps:** rebuild the lockfile under the release-age policy ([71cfe99](https://github.com/tancredesimonin/goflag/commit/71cfe99e14cc428a9efba702689bae23364c272e))


### Documentation

* **tools:** pin the deprecate command, and say why it is not a one-way door ([d1da97f](https://github.com/tancredesimonin/goflag/commit/d1da97f7d353e4f6b112ba61bd4705a3aa2ac0ab))

## 0.1.0 (2026-07-31)

First published version. Every entry above this one is generated from commit
history; this one is written by hand, because the history before it belongs to
a different tool. goflag began as a browser UI called headlint, and replaying
that changelog here would document a product that no longer exists.

Published as `@goflag/cli`; the command it installs is `goflag`. The bare
`goflag` package name is deliberately left unclaimed for now.

### What it does

- **Broken links** — crawls the site, dedupes targets globally so a footer link
  on 500 pages is probed once, and checks each with `HEAD`→`GET` fallback,
  redirect-chain and loop detection, soft-404 and anti-bot triage.
- **Missing translations** — builds a `route × locale` matrix seeded from the
  sitemap, and flags routes that exist in one locale and not another, hreflang
  reciprocity gaps, missing `x-default`, and invalid locale tags.
- **robots.txt policy** — flags a site that forbids crawling while its pages
  ask to be indexed. Both cannot hold, and robots.txt wins.
- **SEO metadata** — the `<head>` mistakes that cost traffic and are invisible
  in a browser: missing or oversized title and description, missing or relative
  canonical, missing `og:title` / `og:description` / `og:image`, missing
  viewport, contradictory robots directives.

### Running it

- `goflag <url>` audits a deployed site. `--start "pnpm start"` boots the app
  first and stops it afterwards, so a merge can be gated on the built output.
- `--regressions-only` with `--baseline` fails only on findings that are new,
  and `--max-debt` ratchets the known ones down. A gate that can never reach
  zero gets switched off, and a suppression file that reports green lies.
- `--json` and `--summary` produce the machine-readable report everything else
  is built on.

### Known limits

- Scope is Next.js App Router: diagnostics and fix snippets assume it.
- Translation gaps and hreflang reciprocity live outside the rule catalogue, so
  they carry no severity overlay of their own.
- No rule carries provenance metadata yet. Treat the length thresholds as the
  heuristics they are, not as specification.
