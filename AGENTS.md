# AGENTS.md

## What this is

Goflag is a **Node/TypeScript CLI**. It crawls a site and reports broken links,
missing translation pages, a robots.txt that contradicts the pages it serves,
and missing or misconfigured SEO metadata. The JSON
report is the source of truth. There is no web app and no browser UI here.

The repository is a pnpm workspace (`packages/*`, `apps/*`) holding two
published packages and one deployed app:

- `packages/cli` (`@goflag/cli`) — the auditor. Published.
- `packages/next` (`@goflag/next`) — the library that produces what the auditor
  checks for: declare a site's routes once, derive metadata, the hreflang
  cluster, the sitemap and robots.txt from them. **Not yet published** — the
  first version goes out by hand, since npm cannot attach a trusted publisher
  to a package that does not exist. Plan: `docs/next-plan.md`.
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

## Releasing

Two packages, two tag namespaces: `v*` for the CLI, `next-v*` for the library.
Merging `develop` into `main` is the decision to publish — one `release` job
handles both packages and pushes once, and each tag triggers its own
`publish:*` job, which trades a short-lived OIDC token for the right to publish
that one package. There is no npm credential in CI.

A release only happens when a package's **published surface** moved (its `src`,
its manifest, and the files that reach its tarball). A `fix(ci)` spends no
version number.
