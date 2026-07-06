# AGENTS.md

## What this is

Goflag is a **Node/TypeScript CLI** (no Next.js, no browser UI). It crawls a
site and reports broken links, missing translation pages, and
missing/misconfigured SEO metadata. The JSON report is the source of truth.

## Layout

- `src/lib/core/**` — framework-agnostic engine: crawl, fetch/extract (static +
  headless Chromium), link audit, i18n matrix + reciprocity, probes.
- `src/lib/rules/**` — the SEO metadata checks and the pure `lint()` runner.
- `src/report/**` — the `GoflagReport` schema, the orchestrator (`runAudit`),
  and the terminal renderer.
- `src/cli.ts` — argument parsing, orchestration, exit codes.
- `test/**` — Hono fixture servers + integration tests (some use real Chromium).

## Toolchain

- Node `>=20.11`; repo pins **`pnpm@9.15.0`** via `packageManager`. Use
  `corepack enable && corepack prepare pnpm@9.15.0 --activate`.
- Headless SPA tests need Chromium: `pnpm exec playwright install chromium`.

## Verify / test

```sh
pnpm lint && pnpm typecheck && pnpm format:check
pnpm build
pnpm test:unit          # no network / no Chromium
pnpm test:integration   # boots fixture servers; SPA tests use real Chromium
```

## Run the CLI from source

```sh
pnpm dev https://example.com --static --depth 1
```

Exit codes: `0` clean, `1` findings found, `2` fatal.
