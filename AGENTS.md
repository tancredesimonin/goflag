# AGENTS.md

## What this is

Goflag is a **Node/TypeScript CLI**. It crawls a site and reports broken links,
missing translation pages, a robots.txt that contradicts the pages it serves,
and missing or misconfigured SEO metadata. The JSON
report is the source of truth. The CLI itself has no UI: nothing it does
requires a browser to look at.

The repository is a pnpm workspace (`packages/*`, `apps/*`) with two things
that ship: `packages/cli` (`@goflag/cli`, published to npm) and `apps/website`
(`@goflag/website`, deployed to goflag.tech). The rest of the tree is workspace
plumbing.

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

## Run the CLI from source

```sh
pnpm dev https://example.com --static --depth 1
```

Root `dev` is `pnpm --filter @goflag/cli dev` (tsx); arguments after the script
name are forwarded to the CLI.

Exit codes: `0` clean, `1` findings found, `2` fatal.

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
passed at runtime because `robots.ts` reads it per request: production says
`allow`, anything else says `Disallow: /` and adds `X-Robots-Tag: noindex`, and
those two must agree or goflag flags its own site.

The image builds only `@goflag/website` — the Dockerfile installs with
`--filter "@goflag/website..."`. `packages/cli` reaches users through npm, and
its devDependencies would drag Playwright into a container that never runs a
test.

Local dry run, from a clean checkout:

```sh
SERVER_IP=<host> KAMAL_REGISTRY_USERNAME=<token-user> KAMAL_REGISTRY_PASSWORD=<token> \
  kamal deploy -d develop
```
