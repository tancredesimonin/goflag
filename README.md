# Website Doctor

> A local checkup for your website.

Website Doctor is a free and open-source local tool that diagnoses your website before the internet does. Run it against any local URL (`http://localhost:3000`, a static HTML file, a `*.local` host) and get an instant, honest second opinion on what your site is shipping.

The first specialist in the clinic is **Meta** — a deep inspector for everything in your `<head>`: HTML metadata, Open Graph, Twitter/X cards, JSON-LD structured data, favicons, manifests, `hreflang`, robots and sitemaps. More specialists (`a11y`, `perf`, `links`, `headers`) will join later.

## What it does

- **Inspects** every metadata tag your page actually ships, including dynamically rendered ones.
- **Lints** them against a curated, versioned ruleset (critical / warning / info).
- **Previews** how your page will render on Google, X (Twitter), Facebook, LinkedIn, Discord, Slack, WhatsApp, iMessage and Pinterest — pixel-faithful, side by side.
- **Suggests** what's missing, including ready-to-paste JSON-LD blocks (`Organization`, `WebSite`, `Article`, `BreadcrumbList`, …).
- **Runs locally**, with no account, no cloud and no telemetry by default.

## Quick start

> Coming soon — the project is in early development.

```sh
npx website-doctor meta http://localhost:3000
```

This will crawl the URL, run all enabled checks, and open a local UI at `http://localhost:7777` with previews and a fix list.

## Status

Pre-alpha. The product specification is being finalized; first runnable version is on its way.

## License

MIT.
