---
updated: 2026-09-23
---

# Roadmap — goflag

> State observed on 2026-09-23: latest tags `v0.2.13` (2026-09-22), `next-v0.4.0` and
> `og-v0.2.0` (2026-08-16) — the three versions npm serves. Integration on `develop`,
> production on `main`; `develop` is one commit ahead, the move to pnpm 12 (!218).
> In production: the three packages on npm, and goflag.tech, redeployed from `main` on
> 2026-09-22. No merge request is open.

## Now

### 3.5 — translation holes move into the rule registry

**Why**: goal 2 — no verdict without a rigor or a source.
**Done when**: `missingTranslations` (holes + reciprocity) is produced by catalogue rules, and
no published rule emits `rigor: null` any more without explaining why.
**State**: half done. The second half holds: the catalogue exposes 58 rules — 25 page,
28 site, 5 prose — and the only one at `rigor: null` is the prose rule
`hreflang.sitemap-mismatch`, whose entry says why no specification can settle it;
`hreflang.missing` and `hreflang.cluster-incomplete` are site rules at `rigor: vendor-spec`,
with their sources. The first half does not: the report's `missingTranslations` is still
computed outside the catalogue — holes in `packages/cli/src/report/build.ts`, reciprocity in
`packages/cli/src/lib/core/i18n.ts` — and `packages/cli/src/lib/rules/index.ts` states that
reciprocity is intentionally not a rule there.

## Next

- The documentation audit of goflag.tech from 2026-08-16, never merged:
  `origin/docs/the-site-explains-the-cards` carries one commit (`339e997`, 19 files) pushed
  after its merge request was merged. Its fixes are still missing on `develop`: the landing's
  proof figures say 11 page rules, 3 site rules and 686 tests (`constants.ts`), and
  `/changelog` reads `PACKAGES = ["cli", "next"]`, without `@goflag/og` (done when: rebased and
  merged, or its fixes redone, and `constants.test.ts` holds the rule counts against
  `rules.json`).
- The `.goflag/routes.json` manifest emitted by the library at build time, then consumed by
  the CLI (done when: removing every `hreflang` from the render of a site with a manifest
  produces an **error**, not silence) — `docs/coverage-plan.md` V-4.
- `/raw/[locale]/[slug].md` and multilingual `llms.txt` / `llms-full.txt` derived from the
  registry (done when: the site serves them from the registry, not from hand-written files).
  goflag.tech serves `/raw/docs/*.md`, built from its MDX sources, and a `llms.txt` generated
  from its navigation and the rule catalogue — neither from the `@goflag/next` registry.
- The advisory `sitemap.unlisted-indexable` in the catalogue — the mechanism exists (done when:
  the rule is in `rules.json`) — `docs/sitemap-scope-plan.md` X-4.

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
