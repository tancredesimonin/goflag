# Goflag changelog

All notable changes to this project will be documented in this file. See [Conventional Commits](https://www.conventionalcommits.org/) for commit guidelines.

## 0.1.0 (2026-07-31)

First published version. Every entry above this one is generated from commit
history; this one is written by hand, because the history before it belongs to
a different tool. goflag began as a browser UI called headlint, and replaying
that changelog here would document a product that no longer exists.

### What it does

- **Broken links** — crawls the site, dedupes targets globally so a footer link
  on 500 pages is probed once, and checks each with `HEAD`→`GET` fallback,
  redirect-chain and loop detection, soft-404 and anti-bot triage.
- **Missing translations** — builds a `route × locale` matrix seeded from the
  sitemap, and flags routes that exist in one locale and not another, hreflang
  reciprocity gaps, missing `x-default`, and invalid locale tags.
- **robots.txt policy** — flags a site that forbids crawling while its pages
  ask to be indexed. Both cannot hold, and robots.txt wins.
- **SEO metadata** — the `<head>` mistakes that cost traffic and are invisible
  in a browser: missing or oversized title and description, missing or relative
  canonical, missing `og:title` / `og:description` / `og:image`, missing
  viewport, contradictory robots directives.

### Running it

- `goflag <url>` audits a deployed site. `--start "pnpm start"` boots the app
  first and stops it afterwards, so a merge can be gated on the built output.
- `--regressions-only` with `--baseline` fails only on findings that are new,
  and `--max-debt` ratchets the known ones down. A gate that can never reach
  zero gets switched off, and a suppression file that reports green lies.
- `--json` and `--summary` produce the machine-readable report everything else
  is built on.

### Known limits

- Scope is Next.js App Router: diagnostics and fix snippets assume it.
- Translation gaps and hreflang reciprocity live outside the rule catalogue, so
  they carry no severity overlay of their own.
- No rule carries provenance metadata yet. Treat the length thresholds as the
  heuristics they are, not as specification.
