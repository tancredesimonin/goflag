# Headlint

> **Lighthouse for the `<head>`.**
> Preview and lint how your site appears in search and social — locally, in your browser.

[![status: pre-alpha](https://img.shields.io/badge/status-pre--alpha-orange)](./PLAN.md)
[![node](https://img.shields.io/badge/node-%3E%3D20.11-339933?logo=nodedotjs&logoColor=white)](./.nvmrc)
[![pnpm](https://img.shields.io/badge/pnpm-9.15-F69220?logo=pnpm&logoColor=white)](./package.json)
[![license: MIT](https://img.shields.io/badge/license-MIT-green)](#license)

Headlint is a free and open-source dev-grade tool for previewing how your website appears in search and social. Run the local web app, paste any URL (`http://localhost:3000`, a static HTML file, a `*.local` host, or a live site), and see exactly what's in your `<head>` — with a curated set of built-in rules and ready-to-paste fixes.

It covers everything in your `<head>`: HTML metadata, Open Graph, Twitter / X cards, JSON-LD structured data, favicons, manifests, `hreflang`, robots, sitemaps — plus the rendered preview cards your users actually see on Google, X, Facebook, LinkedIn, Discord, Slack, WhatsApp and iMessage.

## What it does

- **Inspects** every metadata tag your page actually ships, including dynamically rendered ones.
- **Lints** them against a curated, built-in ruleset (error / warning / info).
- **Previews** how your page will render on Google, X (Twitter), Facebook, LinkedIn, Discord, Slack, WhatsApp, iMessage and Pinterest — pixel-faithful, side by side.
- **Suggests** what's missing, including ready-to-paste JSON-LD blocks (`Organization`, `WebSite`, `Article`, `BreadcrumbList`, …).
- **Runs locally** in your browser, with no account, no cloud, and no telemetry by default.

## Quick start

Requires Node `>=20.11` and `pnpm` (the repo pins `pnpm@9.15.0` via `packageManager`).

```sh
pnpm install
pnpm dev                    # Next.js dev server on http://localhost:3000
```

Open <http://localhost:3000>, paste the URL you want to inspect, and explore the **Previews**, **Issues**, **Raw**, **Structured data**, **i18n** and **Assets** tabs.

## Develop locally

```sh
pnpm lint                   # ESLint
pnpm typecheck              # tsc --noEmit
pnpm test:unit              # Vitest unit project (engine, libs)
pnpm test:component         # Vitest component project (React, jsdom)
pnpm test:integration       # Vitest integration project (engine end-to-end)
pnpm test:coverage          # Coverage with per-directory thresholds
pnpm test:e2e               # Playwright (auto-builds + boots Next)
pnpm format                 # Prettier
```

`pnpm release` runs `commit-and-tag-version` (bumps `package.json`, updates `CHANGELOG.md`, creates a `vX.Y.Z` tag).

## Status

Pre-alpha. Build plan in [`PLAN.md`](./PLAN.md). The local web app is wired up — engine, preview cards, rule engine, structured-data suggestions, and the i18n matrix all run in the browser. CLI, snapshots, CI integration, and the localhost-vs-prod diff are parked for later (see PLAN.md).

## License

MIT.
