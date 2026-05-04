# Headlint

> **Lighthouse for the `<head>`.**
> Lint how your site appears in search and social — locally, in CI, and as a diff between localhost and production.

[![status: pre-alpha](https://img.shields.io/badge/status-pre--alpha-orange)](./PLAN.md)
[![node](https://img.shields.io/badge/node-%3E%3D20.11-339933?logo=nodedotjs&logoColor=white)](./.nvmrc)
[![pnpm](https://img.shields.io/badge/pnpm-9.15-F69220?logo=pnpm&logoColor=white)](./package.json)
[![license: MIT](https://img.shields.io/badge/license-MIT-green)](#license)

Headlint is a free and open-source dev-grade linter for how your website appears in search and social. Run it against any local URL (`http://localhost:3000`, a static HTML file, a `*.local` host) — or diff your localhost against production — and catch metadata regressions before they ship.

It's the linter for everything in your `<head>`: HTML metadata, Open Graph, Twitter / X cards, JSON-LD structured data, favicons, manifests, `hreflang`, robots, sitemaps — plus the rendered preview cards your users actually see on Google, X, Facebook, LinkedIn, Discord, Slack, WhatsApp and iMessage.

## What it does

- **Inspects** every metadata tag your page actually ships, including dynamically rendered ones.
- **Lints** them against a curated, versioned ruleset (error / warning / info).
- **Previews** how your page will render on Google, X (Twitter), Facebook, LinkedIn, Discord, Slack, WhatsApp, iMessage and Pinterest — pixel-faithful, side by side.
- **Diffs** your localhost state against your live production state — catches regressions before deploy.
- **Suggests** what's missing, including ready-to-paste JSON-LD blocks (`Organization`, `WebSite`, `Article`, `BreadcrumbList`, …).
- **Runs locally**, with no account, no cloud, and no telemetry by default.

## Quick start

> Coming soon — the project is in early development.

```sh
npx headlint inspect http://localhost:3000
npx headlint lint http://localhost:3000
npx headlint diff http://localhost:3000 https://example.com
npx headlint dev http://localhost:3000   # opens the local UI
```

## Develop locally

Requires Node `>=20.11` and `pnpm` (the repo pins `pnpm@9.15.0` via `packageManager`).

```sh
pnpm install
pnpm dev                    # Next.js dev server on http://localhost:3000
pnpm lint                   # ESLint
pnpm typecheck              # tsc --noEmit
pnpm test:unit              # Vitest unit project (engine, libs)
pnpm test:component         # Vitest component project (React, jsdom)
pnpm test:coverage          # Coverage with per-directory thresholds
pnpm test:e2e               # Playwright (auto-builds + boots Next)
pnpm format                 # Prettier
```

`pnpm release` runs `commit-and-tag-version` (bumps `package.json`, updates `CHANGELOG.md`, creates a `vX.Y.Z` tag).

## Status

Pre-alpha. Build plan in [`PLAN.md`](./PLAN.md). Phase 0 (Foundations) just landed — Next.js + Tailwind v4 + Vitest + Playwright + a Hono fixture server are all wired up and CI-gated.

## License

MIT.
