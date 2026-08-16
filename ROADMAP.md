---
updated: 2026-08-16
---

# Roadmap — goflag

> State observed on 2026-08-16: latest tag `v0.2.10` (2026-08-15) for `@goflag/cli`,
> `next-v0.3.3` (2026-08-15) for `@goflag/next`. Integration on `develop`, production on
> `main`; `git describe` answers `v0.2.10-18-gcc15fe0` and `origin/main` is 18 commits behind
> `origin/develop`.
> In production: `@goflag/cli` and `@goflag/next` are on npm, goflag.tech and
> develop.goflag.tech run under Kamal. The pace is several releases a week.

## Now

### Publish 0.2.11

**Why**: goals 1 and 3 of [STRATEGY.md](STRATEGY.md) — a version that is not published
protects no site.
**Done when**: the tag `v0.2.11` exists and `npm view @goflag/cli@0.2.11` answers.
**State**: `packages/cli/package.json` declares `0.2.11` and the changelog is written
(`chore(release): 0.2.11`, e7d1bdb, dated 2026-08-16), on `develop`. All that is missing is the
`develop` → `main` merge: it triggers the `tag` job, which puts the tag on the develop side of
the merge, then `publish:npm` over OIDC.

### 3.5 — translation holes move into the rule registry

**Why**: goal 2 — no verdict without a rigor or a source.
**Done when**: `missingTranslations` (holes + reciprocity) is produced by catalogue rules, and
no published rule emits `rigor: null` any more without explaining why.
**State**: further along than `docs/spec-and-lib-plan.md` says (dated 2026-08-13, where 3.5 is
still marked ⬜ not started). The catalogue exposes 56 rules — 23 page, 28 site, 5 prose —
among them `hreflang.missing` and `hreflang.cluster-incomplete`, `rigor: vendor-spec` with
their sources. Only one rule out of the 56 is still at `rigor: null` —
`hreflang.sitemap-mismatch` — and its entry says why no specification can settle it.

## Next

- Public GitHub mirror + an "issues → GitLab" banner (done when: the `homepage`, `repository`
  and `bugs` the two npm manifests already publish actually resolve).
- `@goflag/og` — extract the hand-written card template in `apps/website`, now at two
  consumers, so I4 is satisfied (done when: `packages/og` exists, published, and both sites
  import it instead of copying it).
- `defineSite({ og })` wires the image URL into the metadata (done when: a site no longer
  writes the `og:image` of its own routes).
- The `.goflag/routes.json` manifest emitted by the library at build time, then consumed by
  the CLI (done when: removing every `hreflang` from the render of a site with a manifest
  produces an **error**, not silence).
- `/raw/[locale]/[slug].md` and multilingual `llms.txt` / `llms-full.txt` derived from the
  registry (done when: the site serves them from the registry, not from hand-written files).

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

Full detail in [packages/cli/CHANGELOG.md](packages/cli/CHANGELOG.md) and
[packages/next/CHANGELOG.md](packages/next/CHANGELOG.md).

- **0.2.11** (changelog 2026-08-16, on `develop`) — the sitemap's document tree is kept and
  judged; a site can be questioned (`--advisories`) and not only judged; `/doc/` is no longer
  read as a locale.
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
