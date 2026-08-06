# AGENTS.md

## What this is

Goflag is a **Node/TypeScript CLI**. It crawls a site and reports broken links,
missing translation pages, a robots.txt that contradicts the pages it serves,
and missing or misconfigured SEO metadata. The JSON
report is the source of truth. There is no web app and no browser UI here.

The repository is a pnpm workspace (`packages/*`, `apps/*`). Today the only
package is `packages/cli` (`@goflag/cli`) — the rest of the tree is workspace
plumbing, not code that ships.

## Layout

- `packages/cli/src/lib/core/**` — framework-agnostic engine: crawl, discovery,
  fetch/extract (static and headless Chromium), link audit (`links/`), the i18n
  matrix and reciprocity check, probes (`robots`, `sitemap`, `manifest`), and
  the pure `lint()` / `lintSite()` runners.
- `packages/cli/src/lib/rules/**` — the SEO metadata rule registry
  (`index.ts`) and its types. Each rule is a pure `Page -> Issue[]`; the runner
  that iterates them lives in `core/lint.ts`.
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
