---
updated: 2026-11-01
---

# Roadmap — goflag

> State observed on 2026-11-01: latest tags `v0.2.16` (2026-10-25), `next-v0.4.0` and
> `og-v0.2.0` (2026-08-16) — the three versions npm serves. Integration on `develop`, production
> on `main`. Since the release merge (!265), `develop` is ahead by the roadmap update (!266),
> TypeScript 6, Renovate's merges, `--expect-indexing` (!271), and the share cards' fonts, which
> earn `og-v0.3.0` at the next release.
> In production: the three packages on npm, and goflag.tech, redeployed from `main` on
> 2026-10-25.

## Now

### 3.5 — translation holes move into the rule registry

**Why**: goal 2 — no verdict without a rigor or a source.
**Done when**: `missingTranslations` (holes + reciprocity) is produced by catalogue rules, and
no published rule emits `rigor: null` any more without explaining why.
**State**: half done. The second half holds: the catalogue exposes 69 rules — 25 page,
39 site, 5 prose — and the only one at `rigor: null` is the prose rule
`hreflang.sitemap-mismatch`, whose entry says why no specification can settle it;
`hreflang.missing` and `hreflang.cluster-incomplete` are site rules at `rigor: vendor-spec`,
with their sources. The first half does not: the report's `missingTranslations` is still
computed outside the catalogue — holes in `packages/cli/src/report/build.ts`, reciprocity in
`packages/cli/src/lib/core/i18n.ts` — and `packages/cli/src/lib/rules/index.ts` states that
reciprocity is intentionally not a rule there.

## Next

- The `.goflag/routes.json` manifest emitted by the library at build time, then consumed by
  the CLI (done when: removing every `hreflang` from the render of a site with a manifest
  produces an **error**, not silence) — `docs/coverage-plan.md` V-4.
- `/raw/[locale]/[slug].md` and multilingual `llms.txt` / `llms-full.txt` derived from the
  registry (done when: the site serves them from the registry, not from hand-written files).
  goflag.tech serves `/raw/docs/*.md`, built from its MDX sources, and a `llms.txt` generated
  from its navigation and the rule catalogue — neither from the `@goflag/next` registry.

## Someday

- An "audit these URLs, do not crawl" mode — only if real usage shows that the manual
  `pnpm seo` is never run.
- Extract `@goflag/spec` from the CLI, if a second consumer appears (I4).
- Export `AI_PROVIDERS` / `buildAiPrompt` without the React components that come with them
  (`docs/spec-and-lib-plan.md` §6.4 — the code lives in a site, nothing of the sort here).
- A helper that rasterises the `.ico` with `sharp` as an optional peer.
- `@goflag/og/render` on satori directly, the day a non-Next consumer exists.
- Migrate `fix-my-youtube-links` onto the library, or decide never to.

## Shipped

Full detail in [packages/cli/CHANGELOG.md](packages/cli/CHANGELOG.md),
[packages/next/CHANGELOG.md](packages/next/CHANGELOG.md) and
[packages/og/CHANGELOG.md](packages/og/CHANGELOG.md).

- **Share cards take the site's fonts and can draw its accent** (on `develop`, not yet tagged)
  — `@goflag/og` gains `fonts` (a lazy loader, read once per process, refusing WOFF2 and
  anything that is not a font), `accentBar`, `content.footer` and `ogCardResponse`.
  tancrede, openfinanceguide and tancredo hand-write a satori route of 202, 216 and 253 lines,
  and a card that could carry no font was the first thing stopping them; the first two are
  near-copies, and all three draw the same 8px bar. goflag.tech is the first consumer: its
  cards are set in the JetBrains Mono it already commits, with the bold the bundled face lacks.
  Neither site has migrated, and that is each site's call: a scratch port removes 116 and 114
  lines, and costs the rule above the footer, the line on its right and the coloured host,
  which the card cannot draw.
- **An operator can say whether a target belongs in an index** (on `develop`, not yet tagged)
  — `--expect-indexing no|yes`, a gate flag that is only ever an argument. Under `no`,
  `robots.blocks-site` and `sitemap.entry.noindex` stop firing, and `indexing.not-excluded` and
  `indexing.blocked-url-indexable` ask whether the host is really out of the index. Under `yes`,
  `indexing.site-blocked` makes a whole-site block an error, and `indexing.site-excluded` names a
  `noindex` on the home or on every page. On `develop.tancrede.eu`, the 2 findings all four sites
  pay for with `--max-debt 2` become 1 that says what they hid: 24 pages whose `noindex` Googlebot
  cannot read. The sites have not moved, and they cannot before `seo-goflag.yml` gives its two jobs
  a declaration each: `seo` and `seo:mr` share `GOFLAG_ARGS`, and `no` on a production-shaped build
  is an error.
- **0.2.16: a robots.txt that keeps AI answer engines out is a finding, and the robots rules
  read the group of the agent they speak for** (!261 to !263, tag 2026-10-25) —
  `robots.blocks-ai-answers`, a site rule at `warning`, for a file that lets Googlebot fetch
  `/` and disallows it to `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot` or
  `Claude-User`, whether through the agent's own group or through `User-agent: *`. Each
  operator states what follows — left out of ChatGPT search answers, not indexed for Claude's
  search, not crawled for Perplexity's results, not fetched when someone asks Claude about a
  page — so it cites the three pages at `vendor-spec` and names, for each agent, the group and
  the line that kept it out. Training crawlers, and the `-User` fetchers whose operators say
  robots.txt may not bind them, are left out. The RFC 9309 matcher now names the `User-agent`
  that selected a group, where it named the group's first line. The two fixes that followed:
  `robots.blocks-site`, `robots.blocks-page` and `sitemap.entry.blocked-by-robots` decide for
  Googlebot, the crawler their sources document, and `llmstxt.link.blocked-by-robots` for
  `Claude-User` — none of them for `*`, which per RFC 9309 §2.2.1 answers for nobody once the
  file names the agent. So a Googlebot allowlist over a `*` disallow no longer reads as a site
  kept out of every search engine, a `Disallow` in Googlebot's own group is reported where it
  was silent, and a file that keeps Googlebot out while naming other agents says which ones it
  lets in. On a file that names nobody, every message is what it was.
- **The site's footer and locale switcher** (!258 and !259, 2026-10-25) — the footer lays its
  links out in titled Product, Project and Legal columns; the locale switcher follows a
  client-side locale change, where after `/fr` to `/en` it still ticked Français and sent a
  reader asking for French to `/fr/en`, a 404 — and `<html lang>` follows it too. In
  production since 2026-10-25.
- **vitest 5** (!260, 2026-10-25) — three majors at once, in the four packages that test. The
  vitest chain leaves `pnpm audit` over every dependency: 60 advisories (6 critical) before, 41
  (3 critical) after, all of what remains in dev tooling. Production dependencies were clean
  before and still are.
- **0.2.15: the audit fetches and parses each page once** (!252 and !255, tag 2026-10-24) —
  the crawl starts a page as soon as a request finishes, not when its batch of four does; the
  link scan reads the links the crawl already parsed for the `<head>` instead of fetching and
  parsing every page again; and a link
  to a page the crawl fetched straight to a 2xx is judged from that answer instead of probed.
  The report is the same byte for byte. Against openfinanceguide's deployed develop site, each
  measured on its own commit: the crawl from 170 s to 82 s, the scan from 91 s to 15 s, the
  link check from 721 s to 618 s.
- **0.2.14: an origin's unknown paths, and its `llms.txt`, are judged** (!232, tag
  2026-10-08) — 6.3, pulled forward on 2026-10-05 for openfinanceguide F09.
  `http.not-found` asks the origin for two invented paths, bare and dotted, and reports a 2xx
  or a 5xx; the `llmstxt.*` rules judge a served `/llms.txt` and stay silent on an absent file
  (`docs/spec-and-lib-plan.md` §6.3).
- **The pages say what is true again** (2026-09-28, !221) — the documentation audit of
  2026-08-16, whose commit (`339e997`) reached its branch after the merge request had merged
  without it, replayed onto `develop`: `/changelog` carries `@goflag/og`, `/docs/og/adopting`
  says what the two migrations took, and the pages on limits, profiles, the report, the rule
  catalogue and the library's guarantees match the engine again. The landing quotes 819 tests
  and 760 pages audited in 7 min (`docs/coverage-plan.md` §6), where it said 686, and 456 pages
  in 4 min. The 11 page rules and 3 site rules this roadmap listed as stale were never on the
  page — the landing had stopped quoting them on 2026-08-05 — so they left `PROOF` instead of
  gaining a test. In production since 2026-10-08.
- **0.2.13, and production back** (2026-09-22, !210 then !217) — `main` takes `next` 16.3.5, and
  goflag.tech, stuck on its build of 2026-08-16 since the deployment of 2026-08-23 failed on
  `@swc/helpers`, serves the docs of 2026-08-20; `@goflag/cli` 0.2.13 is on npm. The four sites
  took it the same day (openfinanceguide !53, tancredo !106, stereo-house !99, tancrede !176).
- **pnpm 12.5.1** (2026-09-23, !218) — the `packageManager` pin, and the lockfile pnpm 12 writes.
- **Show the output instead of describing it** (2026-08-20, !194 to !205) — terminal panels
  rendered from generated transcripts, a preview page that shows a preview, the matrix, the
  fingerprint, the Chromium decision, the phantom locale and the forbidden loop drawn, the
  README quoting the renderer and showing the verdict in colour — `docs/visuals-plan.md`,
  V-0 to V-6. In production since 2026-09-22.
- **The pipeline prepares the release** (2026-08-23, !209) — a manual `release:prepare` job on
  `develop` writes the release branch and opens its merge request (`90e3126`); a devDependency
  bump no longer counts as a published surface change (`e9e06c7`).
- **CI and hooks** — every job but the Kamal ones runs on the group's self-hosted runner
  (`4fe8f28`, !193, 2026-08-18); a commit carrying a credential is refused by `betterleaks` (`98d50f2`, !207,
  2026-08-22); the Playwright image moves with the dependency (`97602a8`, !214, 2026-09-12).
- **Public mirror** — `github.com/tancredesimonin/goflag` is public, push-mirrored by GitLab
  from the protected branches. Issues are read on GitHub, with two issue templates; code goes
  through a merge request on GitLab (`CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`,
  `.github/ISSUE_TEMPLATE/`, !167, 2026-08-16).
- **0.2.12, next-v0.4.0, og-v0.1.0 and og-v0.2.0** (tags 2026-08-16) — `@goflag/og` extracted
  from the site and published, both consumers migrated (OG-4); the library declares only what
  it was told about an image, and `og.image.sizes-mismatch` sets the declared size against the
  real one (OG-5); the preview shows what the catalogue cannot judge, with the locale axis
  (`docs/preview-plan.md`).
- **0.2.11** (tag 2026-08-16) — the sitemap's document tree is kept and judged; a site can be
  questioned (`--advisories`) and not only judged; `/doc/` is no longer read as a locale.
- **0.2.10** (tag 2026-08-15) — `robots.txt` read as an RFC 9309 artefact rather than scanned,
  the sitemap rule catalogue, sitemap entries set against the crawl, and every finding
  carrying its `rigor`.
- **0.2.9** (tag 2026-08-15) — icons and `og:image` judged past their presence: file actually
  served, dimensions, ratio, `alt`, `/favicon.ico` asked of the origin.
- **next-v0.3.3** (tag 2026-08-15) — the cluster stated in both vocabularies
  (`og:locale:alternate` and `hreflang`), and the card described.
- **Distribution** (2026-08-02 → 2026-08-06, `142bd20` then `fb80e36`) — npm publishing over
  OIDC, with no credential in CI; two protected tag namespaces; `pnpm release` only spends a
  version number if the package's published surface has moved (`919b590`, 2026-08-03).

## Dropped

- The advisory `sitemap.unlisted-indexable` (`docs/sitemap-scope-plan.md` X-4): a duplicate.
  `sitemap.orphans` has reported the same pages since 0.2.10 — crawled, not `noindex`, absent
  from every sitemap — as a `guideline` warning. X-4 would only have changed its form, a question
  instead of a verdict; the cost of keeping the verdict is that a route declared
  `sitemap: false` in `@goflag/next` raises that warning once the crawl reaches it, unless it
  also says `noindex` or names another page as its canonical (!223).
- `defineSite({ og })` wiring the image URL into the metadata: it had no caller, there was
  nowhere to write it (Next replaces `openGraph` whole, per segment), and writing it would have
  switched off the image of the file convention — `docs/og-plan.md` §10.9 (!180). OG-5 took its
  place.
- The "issues → GitLab" banner on the public mirror: the GitLab project is private, so issues
  are read on GitHub instead — `CONTRIBUTING.md` (!167).
- Pinning `next` 16.3.2 against the standalone crash of 16.3.1: overtaken by Renovate, which
  brought 16.3.3 to `develop` on 2026-08-29 — merging the pin would have downgraded it (!211,
  closed on 2026-08-30).
- The CI `install` job, which published `node_modules` as an artefact: every following job
  reinstalled over it. 1.77 min of setup for zero seconds of work.
- Replaying the verification jobs after a merge: 1431 minutes between 1 and 13 August
  re-verifying what the merge request had already verified.
- The hand-written mirrors, in `apps/website`, of the rule catalogue and the flag reference:
  replaced by `rules.json` and `flags.json`, generated and read.
- The `pnpm.overrides` block in `package.json`: pnpm 11 no longer reads that field; the
  security floors live in `pnpm-workspace.yaml`.
- Guessing the locale axis from path shape: `/cv` had become a locale, and produced 31
  findings that did not exist.
