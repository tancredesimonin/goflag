# Headlint

> Lighthouse for the `<head>`.

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

## Status

Pre-alpha. Build plan in [`PLAN.md`](./PLAN.md). First runnable version on its way.

## License

MIT.
