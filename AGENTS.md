# AGENTS.md

## What this is

Goflag is a **Node/TypeScript CLI**. It crawls a site and reports broken links,
missing translation pages, a robots.txt that contradicts the pages it serves,
and missing or misconfigured SEO metadata. The JSON
report is the source of truth. The CLI itself has no UI: nothing it does
requires a browser to look at.

The repository is a pnpm workspace (`packages/*`, `apps/*`) holding two
published packages and one deployed app:

- `packages/cli` (`@goflag/cli`) — the auditor. Published.
- `packages/next` (`@goflag/next`) — the library that produces what the auditor
  checks for: declare a site's routes once, derive metadata, the hreflang
  cluster, the sitemap and robots.txt from them. Published. Plan:
  `docs/next-plan.md`.
- `apps/website` — goflag.tech. Deployed, not published, and the first consumer
  of `@goflag/next`. It audits itself with goflag in its own pipeline
  (`pnpm --filter @goflag/website seo`), which is the closest thing to an
  end-to-end test the two products have.

**Invariant I3, enforced by lint**: neither `packages/next` nor `apps/**` may
import from `packages/cli`. The two products must stay independently useful.

## Layout

- `packages/cli/src/lib/core/**` — framework-agnostic engine: crawl, discovery,
  fetch/extract (static and headless Chromium), link audit (`links/`), the i18n
  matrix and reciprocity check, probes (`robots`, `sitemap`, `manifest`), and
  the pure `lint()` / `lintSite()` runners.
- `packages/cli/src/lib/rules/**` — the SEO metadata rule catalog. `index.ts`
  is the registry: each rule is a sourced descriptor with a pure evaluator over
  the `Extraction` model (`extraction/`), never over raw HTML. `sources/` is
  the cited source-of-truth catalog, `profiles/` the `--profile` policy
  overlay, `evaluate.ts` the runner; `core/lint.ts` wires them to a `Page`.
  `prose.ts` + `advisory.ts` are the questions goflag states but refuses to
  answer — they carry evidence to an agent and never a verdict. Design and
  remaining phases: `docs/rules-catalog-plan.md`.
- `packages/cli/src/lib/runner/**` — boot-and-audit support for `--start`.
- `packages/next/src/**` — the route registry. `site.ts` (`defineSite`),
  `routes.ts` (families, the registry, sitemap and robots projections),
  `metadata.ts`, `locate.ts` (canonical + hreflang cluster), `locale.ts` (tag
  forms). `conformance.test.ts` judges the library's own output by invariants
  named after the rules the CLI reports — provisional, and meant to be replaced
  by the real catalogue once it is exported.
- `packages/cli/src/report/**` — the `GoflagReport` schema (`types.ts`), the
  orchestrator (`runAudit` in `build.ts`), and the terminal/summary/diff
  renderers.
- `packages/cli/src/cli.ts`, `packages/cli/src/cli-args.ts` — argument parsing,
  orchestration, exit codes.
- `packages/cli/test/**` — Hono fixture servers + integration tests (some use
  real Chromium).
- `packages/cli/fixtures/**` — static fixture sites. Prettier-ignored on
  purpose: they are captured verbatim and must stay byte-for-byte identical.
- `apps/website/**` — the marketing and documentation site (`goflag.tech`).
  Next.js + next-intl (`en`, `fr`, `es`, `pt-br`, default `en`), MDX content
  under `content/`. It is audited by the CLI it documents:
  `pnpm --filter @goflag/website seo`.
- `Dockerfile`, `config/deploy*.yml`, `.kamal/**` — how that site is built and
  shipped. See **Deploy** below.
- `tools/**` — published artefacts that are not products, deliberately outside
  the workspace globs. Nothing here is built, tested or released by the
  workspace scripts.

## Toolchain

- Node `>=22` (`engines`); `.nvmrc` pins `24.18.1`.
- Repo pins **`pnpm@11.18.0`** via `packageManager`. Use
  `corepack enable && corepack prepare pnpm@11.18.0 --activate`.
- Headless SPA tests need Chromium. `playwright` is a devDependency of the CLI
  package, not of the root, so install it from that package:
  `pnpm --filter @goflag/cli exec playwright install chromium`.

## Verify / test

```sh
pnpm lint && pnpm typecheck && pnpm format:check
pnpm build
pnpm test:unit          # no network / no Chromium
pnpm test:integration   # boots fixture servers; SPA tests use real Chromium
```

`lint`, `format:check` and `format` run once at the root over the whole
repository. `build`, `typecheck`, `test*` and `clean` fan out with `pnpm -r`, so
they cover every workspace package. To work on one package only, filter:
`pnpm --filter @goflag/cli test`.

A husky `pre-commit` hook runs Prettier over staged files, so `format:check`
should never be what CI tells you about. It formats only — linting and
typechecking stay in the commands above, and in CI. Skip it with
`git commit --no-verify` when you must; CI still has the last word.

## Run the CLI from source

```sh
pnpm dev https://example.com --static --depth 1
```

Root `dev` is `pnpm --filter @goflag/cli dev` (tsx); arguments after the script
name are forwarded to the CLI.

Exit codes: `0` clean, `1` findings found, `2` fatal.

## Releasing

Two packages, two tag namespaces: `v*` for the CLI, `next-v*` for the library.
Both are **protected tags**, creatable by Maintainers — which means the release
bot, and you when CI is down.

`main` and `develop` accept a push from **no one**, CI included. So the version
bump and the changelog are written on a branch and reviewed like any other
commit; nothing but a tag is ever written back to the repository by a runner.

```
pnpm release              on a branch cut off develop — bumps what moved,
                          writes the changelogs, commits
  → merge request into develop
  → merge develop into main         the decision to publish
  → job `tag` on main               reads each manifest, creates the missing tag
  → job `publish:npm` / `publish:next`   OIDC, one package each
```

`pnpm release` (`scripts/release.mjs`) holds every judgement: a release only
happens when a package's **published surface** moved (its `src`, its manifest,
and the files that reach its tarball), so a `fix(ci)` spends no version number.
The `tag` job decides nothing — it compares the version on `main` against the
tags on the remote and creates what is missing, which makes it idempotent and
safe to re-run.

There is no npm credential in CI: each `publish:*` job trades a short-lived OIDC
token for the right to publish its one package. Pushing the tag needs
`RELEASE_TOKEN`, a project access token with the Maintainer role.

Never `git push --tags` or `--follow-tags` from CI. GitLab declines an entire
push payload when any single ref in it is refused, so bundling refs turns one
rejection into all of them — the 2026-08-08 failure, where a refused branch took
two valid tags down with it.

## Deploy (apps/website)

| Branch    | Destination               | URL                             |
| --------- | ------------------------- | ------------------------------- |
| `develop` | `kamal deploy -d develop` | `https://develop.goflag.tech`   |
| `main`    | `kamal deploy`            | `https://goflag.tech` (+ `www`) |

Both run from `.gitlab-ci.yml` on push, onto the shared OVH host described in
the `infrastructure` repository. DNS, TLS, the status page and the host metrics
all live there; nothing about them is configured here.

They are **two builds, not one image promoted twice**. Next bakes the origin,
the robots policy and the analytics script into its output, so the environment
has to be chosen before `next build` runs — that is what `builder.args` in
`config/deploy.yml` and `config/deploy.develop.yml` set. `APP_ENV` is also
passed at runtime, because the container's environment is what
`lib/seo/site.ts` reads when the server module loads: production says `allow`,
anything else says `Disallow: /` and adds `X-Robots-Tag: noindex`. The two come
from one `indexable` flag on `defineSite`, so they cannot disagree — which is
what goflag reports as `robots.conflict` when they do.

The image builds only `@goflag/website` — the Dockerfile installs with
`--filter "@goflag/website..."`. `packages/cli` reaches users through npm, and
its devDependencies would drag Playwright into a container that never runs a
test.

Local dry run, from a clean checkout:

```sh
SERVER_IP=<host> KAMAL_REGISTRY_USERNAME=<token-user> KAMAL_REGISTRY_PASSWORD=<token> \
  kamal deploy -d develop
```
