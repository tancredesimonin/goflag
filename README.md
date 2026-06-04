# Goflag

> **A three-lens local site auditor.**
> Enter a base URL once → audit your sitemap, your `<head>`, and your links — locally, in your browser.

[![status: pre-alpha](https://img.shields.io/badge/status-pre--alpha-orange)](./PLAN.md)
[![node](https://img.shields.io/badge/node-%3E%3D20.11-339933?logo=nodedotjs&logoColor=white)](./.nvmrc)
[![pnpm](https://img.shields.io/badge/pnpm-9.15-F69220?logo=pnpm&logoColor=white)](./package.json)
[![license: MIT](https://img.shields.io/badge/license-MIT-green)](#license)

Goflag is a free and open-source dev-grade site auditor. Run the local web app, paste any base URL (`http://localhost:3000`, a static HTML file, a `*.local` host, or a live site), and Goflag fans out from one shared discovery pass into three related audits:

| Lens        | Question it answers                                                      | Route      |
| ----------- | ------------------------------------------------------------------------ | ---------- |
| **Sitemap** | _Can search engines discover every page, and is the map itself healthy?_ | `/site`    |
| **Head**    | _Does each page present itself correctly in search & social?_            | `/inspect` |
| **Links**   | _Do all the links on the site actually resolve?_                         | `/links`   |

All three share one `discoverSitemap` pass, then run their own engine over the discovered page set. Everything runs locally — no account, no telemetry.

## What it does

- **Sitemap** — locates the sitemap (robots.txt → well-known → crawl), checks it's well-formed and declared, then strengthens that with entry **reachability**, `lastmod` hygiene, protocol/host consistency, robots conflicts, and **orphan-page** detection.
- **Head** — inspects every metadata tag your page ships (including dynamically rendered ones), lints against a curated ruleset (error / warning / info), previews how the page renders on Google, X, Facebook, LinkedIn, Discord, Slack, WhatsApp, iMessage and Pinterest, and suggests ready-to-paste JSON-LD.
- **Links** — scrapes every page's links and probes each unique target **once** (deduped globally), with `HEAD`→`GET` fallback, redirect-chain/loop detection, soft-404 + anti-bot triage, and per-host politeness caps. Broken links are mapped back to the pages that reference them.
- **Runs locally** in your browser, with no account, no cloud, and no telemetry by default.

## Quick start

Requires Node `>=20.11` and `pnpm` (the repo pins `pnpm@9.15.0` via `packageManager`).

```sh
pnpm install
pnpm dev                    # Next.js dev server on http://localhost:3000
```

Open <http://localhost:3000>, paste a base URL, and hit **Audit site**. You land on a dashboard with three result cards (Sitemap / Head / Links); open any one for its full report. You can still inspect a single URL directly, or jump straight to `/site` and `/links`.

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

Pre-alpha. Build plan in [`PLAN.md`](./PLAN.md). The local web app is wired up across all three lenses — sitemap analysis, the head engine (preview cards, rule engine, structured-data suggestions, i18n matrix), and the link checker all run in the browser from a single base-URL entry. CLI, snapshots, CI integration, and the localhost-vs-prod diff are parked for later (see PLAN.md).

## License

MIT.
