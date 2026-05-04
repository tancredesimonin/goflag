# Headlint — Build Plan to v1.0

> Living document. Check items as we ship. Each phase has a clear, testable Definition of Done.

**Stack**: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui (via shadcn studio license) + Playwright + cheerio + pnpm.

**Architecture recap**: a single Next.js app _is_ the product. Server Actions / Route Handlers expose the engine; the same app's pages render the UI. A small Node CLI (`bin/headlint.ts`) either boots the Next.js server (interactive mode) or runs the engine directly (CI mode). Engine code lives in `src/lib/core/` and is imported by both. ~85% code reuse between UI and CI.

---

## Strategy & business model

The "why" behind the build plan. Every phase below should serve at least one of these goals; if a phase doesn't, it should be cut or deferred.

### Audience: developers, not marketers

The product is built for **developers on teams that ship content-heavy sites** (marketing pages, blogs, docs, e-commerce PDPs). Marketers and PMs are _consumers of the output_, not users of the tool — they never install anything. The localhost-first design is non-negotiable: it's what differentiates us from every paste-a-URL competitor (opengraph.xyz, metatags.io, socialsharepreview.com) and aligns with the dev workflow of catching issues _before_ deploy, not after.

### Whitespace & positioning

The existing market is split:

- **Paste-URL preview tools** (opengraph.xyz, metatags.io, socialsharepreview.com) — marketer-leaning, post-deploy, no rules, no fixes, no CLI, no CI integration.
- **General SEO crawlers** (Ahrefs, Screaming Frog, Yoast) — marketer-leaning, deployed-only, broad and shallow on `<head>` quality.
- **Performance-first dev linters** (Lighthouse, PageSpeed) — dev-leaning, but their SEO tab is a ~7-check afterthought.

Nobody owns _"the dev-grade linter for how a site appears in search and social, runnable on localhost and in CI, with rules + fixes + framework-aware suggestions"_. That's the gap.

> **Positioning: "Lighthouse for the `<head>`."**
> Lint how your site appears in search and social — locally, in CI, and as a diff between localhost and production.

**In scope** (the moat is depth, not breadth): OG / Twitter / Discord / Slack / iMessage previews, Google SERP rendering, JSON-LD validity, hreflang, robots, sitemap, manifest, favicons.
**Deliberately out of scope**: performance metrics, accessibility audits, security headers, broken-link crawls. Specialization is the moat.

### Business model — three layers

1. **Open-source CLI + engine** (this plan, through v1.0). Free forever, permissive license (MIT/Apache), lives in CI. The engine is the durable artifact.
2. **Hosted SaaS layer** (v2.x, _not_ in this plan but designed for): continuous monitoring of deployed sites with regression alerts, localhost-vs-prod diff history, shared rule configs across a team, public/private shareable reports for marketers, SSO / audit log / RBAC for enterprise. Realistic ARR ceiling: low-single-digit millions — a great indie SaaS, not a unicorn category.
3. **Acquisition target** (the exit): deploy platforms (Vercel / Netlify / Cloudflare Pages) and headless CMSes (Sanity / Contentful / Builder) are the natural acquirers. The product is designed so the engine and the hosted layer can be cleanly separated and absorbed by a buyer.

### Strategic features (the moat / demo / exit triggers)

These three features exist not just for user value, but as moat, viral loop, and acquirer demo respectively. They are called out across phases:

- **Localhost-vs-production diff** (Phase 9.5) — the unique wedge no competitor can do. The headline demo for Vercel/Netlify BD ("your refactor is about to break the OG tags currently live in prod") and the seed for the SaaS continuous-monitoring layer.
- **PR comments with rendered preview cards** (Phase 9.8) — the viral loop. Engineers see a Vercel-style preview-card screenshot in their PR; that screenshot drives every install.
- **Shareable HTML reports** (Phase 11.5) — the marketer hand-off. Devs run the tool, marketers open a single HTML file. Closes the audience-vs-buyer gap without forcing marketers to install anything.

### Architectural non-negotiables (driven by the strategy)

- **Engine and UI are cleanly separable.** Engine code in `src/lib/core/**` must never depend on Next.js / React / DOM / browser APIs. The engine must be shippable as a standalone package (`@headlint/core`) and reusable by a future hosted SaaS, a VS Code extension, or an acquirer's platform.
- **No telemetry by default**, ever. Optional opt-in only, and only in hosted contexts.
- **Multi-tenant ready, even if single-tenant for v1.0**: no global state, no implicit `process.cwd()` reads outside CLI entry points, all config passed explicitly. This avoids a costly rewrite when the SaaS layer ships.
- **Output formats are first-class.** Every command must support `--json` and (where it makes sense) `--report <path.html>`. Anything that's only available in the local UI is invisible to CI, marketers, and future SaaS.

---

## CLI surface

A single flat command tree — every subcommand maps to one verb. No `meta` namespace; the whole product _is_ the head/meta linter.

| Command | Purpose | Phase |
|---|---|---|
| `headlint inspect <url>` | Fetch, parse, and dump a `Page` | 1 |
| `headlint dev <url>` | Boot the local UI for interactive inspection | 3 |
| `headlint lint <url>` | Run rules, print issues, exit non-zero on errors | 5 |
| `headlint init` | Interactive scaffolder for `headlint.config.ts` | 8 |
| `headlint snapshot [--update]` | Diff or update committed snapshots | 9 |
| `headlint ci <url> --base <ref>` | Differential lint for CI (three-lane runner) | 9 |
| `headlint diff <local> <prod>` | Localhost-vs-production diff (the wedge) | 9.5 |

Global flags available on every command where meaningful: `--json`, `--report <path.html>`, `--config <path>`.

---

## Testing standards (apply to every phase)

Headlint's whole value proposition is "trust me to lint your site". That requires the codebase itself to be exhaustively tested. The following standards are non-negotiable and must hold at the end of every phase.

### Test layers

| Layer | Tool | Scope | When |
|---|---|---|---|
| **Unit** | Vitest | Every exported function in `src/lib/**` | Same MR as the code |
| **Component** | Vitest + React Testing Library | Every React component in `src/components/**` and `src/lib/previews/**` | Same MR as the component |
| **Integration** | Vitest | URL → `Page` → `Issue[]` end-to-end through the engine, crawler with multiple URLs, config + rule interactions | Per phase that adds a public engine surface |
| **Visual regression** | Playwright | Every preview card rendered against fixture data, screenshot-diffed | Phase 4 onward, per preview |
| **E2E (UI)** | Playwright | Full user flow: `headlint dev` boots, URL inspected, preview tabs render | Phase 3 onward |
| **E2E (CLI)** | Vitest + child_process | Every CLI command run against a local fixture HTTP server, asserts stdout + exit code | Per CLI command added |
| **Smoke / packaging** | Shell script in CI | `npm pack` → install in tmp dir → run real command against fixture site | Phase 11 + every release |

### Coverage thresholds (enforced in CI)

- `src/lib/core/**`, `src/lib/rules/**`, `src/lib/snapshots/**`, `src/lib/suggestions/**`: **≥ 90%** lines and branches
- `src/lib/previews/**`: **100%** of components must have at least one render test + one visual regression
- `src/components/**`: **≥ 70%** lines
- `src/lib/cli/**` and `bin/**`: **100%** of commands must have one E2E test

### Per-rule and per-suggestion contracts

- **Every rule** in `src/lib/rules/` must ship with **at least one passing fixture and one failing fixture**, plus assertion that the failing fixture produces the expected `Issue` payload (id, severity, message contains expected substring, fix is correct shape). CI fails if a rule lands without both.
- **Every suggestion template** must ship with one fixture page that triggers it and one that doesn't, plus a JSON-LD validity assertion on the generated output.
- **Every preview card** must ship with at least three fixture inputs (full data / minimal data / missing-image fallback) and a visual regression baseline for each.

### CI gating

- All tests + lint + typecheck must pass on every MR; merging into `develop` requires green pipeline.
- Coverage thresholds enforced via Vitest config; pipeline fails if thresholds drop.
- Visual regression diffs require explicit reviewer approval (uploaded as MR artifacts).
- No skipped or `.only` tests allowed (lint rule).

### Test fixture conventions

- Real-world fixtures (HTML snapshots from `tancrede`) live in `fixtures/sites/<site-name>/`.
- Synthetic fixtures (handcrafted to exercise specific rules) live in `fixtures/rules/<rule-id>/{pass,fail}.html`.
- A tiny Hono fixture server (`test/fixture-server.ts`) serves fixtures over HTTP for crawler/CLI tests so we exercise the real fetch path, not mocks.
- **Mocks are forbidden in engine tests**; the engine must always be tested through its real fetch + parse path against the fixture server.

### Definition of "phase complete" — testing addendum

In addition to each phase's stated DoD, a phase is not complete until:
- All new code respects the coverage thresholds above.
- Every new public function, component, rule, suggestion, preview, and CLI command has the required test layers.
- The CI pipeline is green on the MR that closes the phase.

---

## Component selection — shadcn studio MCP workflow

This project has a paid **shadcn studio** license, which gives access to a curated catalog of premium blocks and components beyond the free shadcn/ui base. The license is wired up via environment variables already present in the repo:

- `.env.example` — committed template (placeholder values only)
- `.env` — local file with real `EMAIL` and `LICENSE_KEY` (never committed; **must be excluded by `.gitignore` from Phase 0**)

The **shadcn studio MCP server** is connected to this workspace and is the canonical way to pick components throughout the project.

### Rules of engagement

- **For every new UI surface** (page, panel, card layout, sidebar, table, dialog, form, empty state, hero, etc.), **always consult the shadcn studio MCP first** before hand-writing markup. The studio frequently has a battle-tested, beautifully styled block that maps directly to what we need.
- **Workflow** when adding a UI surface:
  1. Describe the surface in natural language and query the shadcn studio MCP for matching blocks/components.
  2. Compare 2–3 candidates; pick the one that best fits the design language and minimizes custom markup.
  3. Install via the MCP-recommended path (premium installs use the env vars above).
  4. Adapt content/props; never restyle from scratch unless absolutely needed.
- **Free shadcn/ui primitives** (`button`, `input`, `card`, `tabs`, `badge`, `separator`, `tooltip`, `sonner`, `scroll-area`, `dialog`, `dropdown-menu`, `sidebar`) remain the foundation; the MCP is for higher-level blocks built on top of them.
- **Document the choice**: when a phase task says "pick a layout/block", the MR description should state which shadcn studio block was used so future contributors can find it.
- **Never commit `.env`**. Phase 0's `.gitignore` task must explicitly include `.env`, `.env.local`, and `.env.*.local`.

### Concretely, leverage the MCP for at least:

- **Phase 3** — app shell (sidebar + topbar layout), URL input form, header card, raw `<head>` viewer pattern
- **Phase 4** — preview-tab grid layout, focus/zoom interaction patterns
- **Phase 5** — issues panel (severity-grouped lists with expand/collapse, jump-to-anchor)
- **Phase 6** — structured-data tree viewer, suggestion card with copy-snippet
- **Phase 7** — i18n matrix (status grid pattern)
- **Phase 8** — settings/config panels, init-wizard step pattern
- **Phase 9** — snapshot diff viewer, accept-changes flow
- **Phase 12** — docs site landing, rules reference list

If a perfect block doesn't exist in the studio, fall back to composing free shadcn/ui primitives — but log the gap so we can revisit later.

---

## Phase 0 — Foundations

**Goal**: a clean Next.js + shadcn project that builds, lints, tests, and runs.

- [ ] **0.1** Initialize Next.js 15 (App Router, TypeScript, Tailwind, ESLint, src/ dir, `@/*` alias)
- [ ] **0.2** Set Node engines (`>=20.11`) and pnpm version in `package.json`
- [ ] **0.3** Install and init shadcn/ui base; verify the **shadcn studio MCP** is reachable (`EMAIL` and `LICENSE_KEY` already present in `.env`) and that a premium block can be installed end-to-end as a smoke test
- [ ] **0.4** Add baseline free shadcn primitives: `button`, `input`, `card`, `tabs`, `badge`, `separator`, `sidebar`, `tooltip`, `sonner`, `scroll-area`, `dialog`, `dropdown-menu`. Higher-level blocks come later via the studio MCP per the workflow above.
- [ ] **0.5** Configure TypeScript strict mode + `noUncheckedIndexedAccess`
- [ ] **0.6** Set up Vitest + React Testing Library + jsdom; one trivial passing unit test and one trivial passing component test
- [ ] **0.7** Configure Vitest coverage (`@vitest/coverage-v8`) with the per-directory thresholds defined in Testing Standards; pipeline fails on threshold drop
- [ ] **0.8** Install Playwright + set up `playwright.config.ts` for both visual regression and E2E projects; one trivial passing E2E test
- [ ] **0.9** Add Hono-based fixture HTTP server scaffold at `test/fixture-server.ts` that serves files from `fixtures/`; one passing test that boots it and fetches a fixture
- [ ] **0.10** Add ESLint rule (`vitest/no-focused-tests`, `vitest/no-disabled-tests`) banning `.only` and `.skip`
- [ ] **0.11** Set up Prettier + ESLint config aligned with `tancrede` conventions
- [ ] **0.12** Add `.editorconfig`, `.nvmrc`, `.gitignore`. The `.gitignore` **must** include `.env`, `.env.local`, `.env.*.local` (the shadcn studio license lives there) plus standard Next.js / Node ignores. Confirm `git status` reports `.env` as ignored before committing.
- [ ] **0.13** Add base GitLab CI: `install → lint → typecheck → test:unit → test:component → test:e2e → coverage-gate` on every push to `develop` and MRs
- [ ] **0.14** Add `commit-and-tag-version` setup (mirror `tancrede`'s `pnpm release` flow)
- [ ] **0.15** Polish README with status badge, install snippet (placeholder), short pitch

**Definition of Done**

- `pnpm install && pnpm dev` opens a Next.js page at `http://localhost:3000`.
- `pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:component && pnpm test:e2e` all green.
- `pnpm test:coverage` reports thresholds; intentionally lowering one and re-running fails the gate.
- The fixture server can be booted from a test and serves a known fixture file.
- GitLab pipeline green on `main` with all stages.

---

## Phase 1 — Engine v0: Static extractor + CLI dump

**Goal**: prove we can pull every meaningful tag out of a real page and represent it cleanly.

- [ ] **1.1** Define the canonical `Page` data model in `src/lib/core/types.ts` (raw tags, parsed OG, parsed Twitter, parsed JSON-LD, link rels, meta names, manifest, robots/sitemap probes, hreflang siblings)
- [ ] **1.2** Static extractor in `src/lib/core/extract/static.ts` using `cheerio` — input: HTML string + base URL; output: `Page`
- [ ] **1.3** Fetcher in `src/lib/core/fetch/static.ts` — handles localhost, self-signed certs, follows redirects, captures status/headers
- [ ] **1.4** Side-channel probes: `robots.txt`, `sitemap.xml`, linked `manifest.json`
- [ ] **1.5** JSON-LD parser: extract all `<script type="application/ld+json">`, parse, attach to `Page`
- [ ] **1.6** Image probe utility: dimensions + filesize via `sharp` (only when needed)
- [ ] **1.7** CLI scaffold (`src/bin/headlint.ts`) using `commander`, with `bin` entry in `package.json`
- [ ] **1.8** Command: `headlint inspect <url> [--json]` — prints human-readable summary or full JSON
- [ ] **1.9** Fixtures: snapshot 5–8 representative pages from `tancrede` (home, blog post, contact) into `fixtures/sites/tancrede/`
- [ ] **1.10** Unit tests: every parser/extractor utility (cheerio extractor, JSON-LD parser, image probe, robots/sitemap probes) hits ≥ 90% coverage with hand-crafted edge cases (malformed HTML, invalid JSON-LD, missing fields, relative vs absolute URLs)
- [ ] **1.11** Integration tests: extractor parses each `tancrede` fixture and matches expected `Page` shape — served via the fixture server, not file reads
- [ ] **1.12** E2E (CLI) test: `headlint inspect <fixture-server-url> --json` boots the CLI as a child process, asserts JSON output structure and exit code 0
- [ ] **1.13** E2E (CLI) test: `headlint inspect <unreachable-url>` exits non-zero with a friendly error

**Definition of Done**

- `pnpm headlint inspect http://localhost:3000 --json` (with tancrede running) prints a complete `Page` JSON.
- `pnpm test` exercises the extractor against all fixtures and passes.
- A `Page` from a tancrede blog post correctly contains: title, description, canonical, all OG fields, twitter card, all `hreflang` alternates, JSON-LD blocks, favicon links.

---

## Phase 2 — Engine v0.5: Headless extractor (SPA support)

**Goal**: handle client-rendered metadata so the tool works with _any_ framework, not just SSR.

- [ ] **2.1** Add Playwright (Chromium-only) as optional dep with on-demand install prompt
- [ ] **2.2** Headless extractor in `src/lib/core/extract/headless.ts` — boots a Chromium page, waits for network idle, captures final HTML, runs static extractor on it
- [ ] **2.3** CLI flag plumbing: `--static` forces fetch-only; default auto-detects (try static first, escalate to headless if `<head>` looks suspiciously empty)
- [ ] **2.4** Capture _both_ the initial HTML and the post-hydration HTML; store both in `Page` (useful later for "you have an OG tag injected at runtime — Facebook crawler won't see it" rules)
- [ ] **2.5** Unit tests: headless extractor module — Page object correctly distinguishes server-rendered vs client-injected tags
- [ ] **2.6** Integration test with a fixture SPA (tiny client-rendered HTML page in `fixtures/sites/spa/`) served by the fixture server: confirms headless mode captures the injected metadata that static mode misses
- [ ] **2.7** Integration test: auto-escalation logic — a page with empty `<head>` triggers headless fallback when `--static` is not passed

**Definition of Done**

- `headlint inspect <SPA url>` returns the same complete `Page` as it would for an SSR page.
- The Page object distinguishes server-rendered tags from client-injected ones.

---

## Phase 3 — UI v0: Inspect & view

**Goal**: replace `--json` output with a beautiful local UI. The "wow" demo.

- [x] **3.1** App shell with shadcn sidebar + topbar — **query the shadcn studio MCP** for dashboard/inspector shell candidates, pick the best, document the chosen block id in the MR description
- [x] **3.2** URL input on the home page (`/`) — submits to a Server Action that runs the extractor and stores the result in memory
- [x] **3.3** Inspect page (`/inspect`) with sidebar: list of crawled URLs (single for now), grouped by locale when applicable
- [x] **3.4** Top header card: page title, description, canonical, status code, fetch time, "Re-fetch" button — query the **shadcn studio MCP** for "page header" / "stats card" patterns first
- [x] **3.5** Tabs scaffold: `Previews`, `Issues`, `Raw`, `Structured data`, `i18n`, `Assets` (most empty stubs at this stage)
- [x] **3.6** "Raw" tab: syntax-highlighted `<head>` content (use `shiki`), each tag annotated with its parsed meaning on hover
- [x] **3.7** "Assets" tab v0: favicon grid (renders each `link rel=icon` at its declared size), manifest JSON viewer, robots.txt viewer
- [x] **3.8** Wire `headlint dev <url>` CLI command: spawns Next.js standalone server, opens browser to `/inspect?url=...`
- [x] **3.9** Dark mode by default with theme toggle
- [x] **3.10** Loading + error states (skeleton, toast on fetch failure)
- [x] **3.11** Component tests: every new shadcn-composed component (URL form, header card, raw viewer, favicon grid, manifest viewer) has a render test with realistic props
- [x] **3.12** Server Action test: the inspect action returns a valid `Page` for a fixture URL and a structured error for an unreachable URL
- [x] **3.13** E2E (UI) test: `headlint dev` boots Next.js, Playwright opens `/inspect`, submits a fixture-server URL, asserts that the header card, sidebar, and Raw tab all render with the expected content
- [x] **3.14** E2E (UI) test: error path — submitting an unreachable URL surfaces a toast and does not crash the page

**Definition of Done**

- Running `pnpm headlint dev http://localhost:3000` opens a browser to a working inspect view of the tancrede homepage.
- The Raw tab shows every `<head>` tag, syntax-highlighted, with hover annotations.
- Re-fetch works and updates the view.
- All component tests pass; the inspect E2E flow runs green in CI.

---

## Phase 4 — Preview cards (the headline feature)

**Goal**: pixel-faithful renderings of how the page will look on the major platforms.

- [x] **4.1** Create `src/lib/previews/` package structure; one component per platform
- [x] **4.2** `<GoogleSerpDesktop />` — title, URL breadcrumb, description, with proper truncation rules
- [x] **4.3** `<GoogleSerpMobile />` — different layout + favicon
- [x] **4.4** `<XCardSummaryLarge />` — large image, title, description, domain
- [x] **4.5** `<XCardSummary />` — small image variant
- [x] **4.6** `<FacebookCard />` — feed style, image, title, description
- [x] **4.7** `<LinkedInCard />` — 1.91:1 image ratio quirks, fallback handling
- [x] **4.8** `<DiscordEmbed />` — left bar, embed style
- [x] **4.9** `<SlackUnfurl />` — site_name + image
- [x] **4.10** `<WhatsAppPreview />` — square thumbnail, dense layout
- [x] **4.11** `<iMessageBubble />` — rich link bubble
- [x] **4.12** `<PinterestPin />` — pin layout
- [x] **4.13** Wire all into the "Previews" tab — grid view + "focus" view per platform. _Note: queried the shadcn studio MCP for card-grid / masonry blocks and bounced — every candidate was a marketing/bento layout incompatible with a dense developer inspector. We compose from `Card` primitives + a CSS grid instead, same call we made in Phase 3 for the app shell._
- [x] **4.14** Each preview shows a small footer: which tags it consumed + which fallbacks it used (e.g. "no `og:title` → fell back to `<title>`") — `PreviewFooter` reads the `fallbackChain` populated by `resolvePreview`.
- [x] **4.15** "What if?" toggle per tag — temporarily remove a tag to see how each preview degrades — `Sheet` drawer with one row per tag; suppression set is process-stateful only (no persistence yet, intentional for v1).
- [x] **4.16** Component tests for each preview: 3 fixture inputs (full / minimal / missing-image fallback) per platform, asserting which fallback was used — `src/lib/previews/preview-components.test.tsx` parameterises 11 platforms × 3 fixtures = 33 cases.
- [x] **4.17** Visual regression baseline for each preview (3 fixtures × 11 platforms = 33 baseline screenshots) committed to the repo. _Plan said 30, we ship 33 because both X variants get their own baseline._
- [x] **4.18** E2E (UI) test: navigate to Previews tab, confirm all 11 cards render, "What if I remove `og:image`?" toggle visibly degrades X / Facebook / LinkedIn cards as expected. _X keeps its image because `twitter:image` survives; Facebook + LinkedIn lose theirs._

**Definition of Done** ✅

- [x] Tancrède's homepage renders correctly across all 11 preview cards (live, end-to-end through `/inspect?url=…`).
- [x] The "What if I remove `og:image`?" toggle visibly degrades the X, Facebook and LinkedIn cards in the expected ways (X keeps the image via `twitter:image`; Facebook + LinkedIn fall back to no-image).
- [x] Visual regression suite passes (33 baselines, locked at viewport 800×800).
- [x] All gates green: `pnpm typecheck`, `pnpm lint`, `pnpm test` (299 tests), `pnpm test:e2e` (40 specs), `pnpm format:check`, coverage thresholds for `src/lib/previews/**` (lines 90 / branches 80 / functions 90).

---

## Phase 5 — Rule engine + Issues panel

**Goal**: ship the linter. ~25 MVP rules surfaced in a clean Issues panel.

- [ ] **5.1** Rule type definition in `src/lib/rules/types.ts` (`id`, `severity`, `appliesTo`, `docs`, `check(ctx)`, optional `fix`)
- [ ] **5.2** Rule registry + loader in `src/lib/rules/index.ts`
- [ ] **5.3** Rule runner in `src/lib/core/lint.ts` — input: `Page`, output: `Issue[]`
- [ ] **5.4** Implement first 10 trivial-existence rules: `title.missing`, `title.length`, `description.missing`, `description.length`, `canonical.missing`, `canonical.absolute`, `viewport.missing`, `lang.missing`, `og.image.missing`, `og.image.absolute`
- [ ] **5.5** Implement next 10 OG/Twitter rules: `og.title.missing`, `og.image.dimensions`, `og.image.size`, `og.url.matches`, `twitter.card.missing`, `twitter.image.alt`, `twitter.card.matchesImage`, `og.type.valid`, `og.locale.valid`, `og.siteName.missing`
- [ ] **5.6** Implement structural/i18n rules: `hreflang.reciprocal`, `hreflang.x-default`, `favicon.sizes`, `manifest.missing`, `robots.conflict`
- [ ] **5.7** "Issues" tab UI: grouped by severity (error/warning/info), each with rule id, message, doc link, "Fix it" snippet block, jump-to-tag in Raw view. Query the **shadcn studio MCP** for "issue list" / "linter results" / "audit findings" patterns first.
- [ ] **5.8** Per-rule docs page generator (`/rules/[id]`) — auto-built from rule metadata
- [ ] **5.9** CLI: `headlint lint <url>` — prints issues, exits with non-zero on errors
- [ ] **5.10** Per-rule tests: each rule has `fixtures/rules/<rule-id>/{pass,fail}.html`, an automated harness asserts pass-fixture produces zero issues for that rule and fail-fixture produces exactly the expected `Issue` payload (id, severity, message, fix shape)
- [ ] **5.11** Lint check that fails CI if a rule lands in `src/lib/rules/` without both fixture files
- [ ] **5.12** Component test for the Issues panel: groups by severity, renders fix snippet, jump-to-tag works
- [ ] **5.13** E2E (CLI) tests for `headlint lint`: exit code 0 on clean fixture, exit code 1 with expected stdout on a fixture with errors, `--json` output structure validated

**Definition of Done**

- Running `headlint lint http://localhost:3000` against tancrede prints a real, non-empty issues report.
- All 25 MVP rules are documented at `/rules/<id>` with example fixes.
- Rule unit tests cover both pass and fail cases for every rule.

---

## Phase 6 — JSON-LD intelligence + Suggestions

**Goal**: the structured-data superpower Lighthouse doesn't have.

- [ ] **6.1** JSON-LD validator: parses each block, validates against `schema.org` shapes (use `schema-dts` types + lightweight runtime checks)
- [ ] **6.2** "Structured data" tab: tree view of each JSON-LD block, type-aware. Query the **shadcn studio MCP** for "tree view" / "JSON viewer" / "code explorer" patterns first.
- [ ] **6.3** Inline validation errors per block ("`Article` is missing required `headline`")
- [ ] **6.4** Suggestion engine in `src/lib/suggestions/` — rule-based "this page looks like X but lacks JSON-LD type Y, here's a snippet"
- [ ] **6.5** Suggestion templates: `Organization`, `WebSite` + `SearchAction`, `BreadcrumbList`, `Article`, `Person`, `FAQPage`, `SoftwareApplication`
- [ ] **6.6** Suggestion UI: each suggestion shows generated JSON-LD with "Copy snippet" button. Query the **shadcn studio MCP** for "code block with copy" / "suggestion card" patterns first.
- [ ] **6.7** Page-type heuristics: detect blog posts (URL pattern + `<article>`), detect home (`/`), detect contact (form + page title), to power suggestions
- [ ] **6.8** Surface suggestions both in their own tab and as "info" entries in the Issues panel
- [ ] **6.9** Unit tests: JSON-LD validator handles malformed JSON, missing required fields per schema type, multiple blocks of same type, nested `@graph` structures
- [ ] **6.10** Per-suggestion tests: each template has a triggering fixture and a non-triggering fixture; the generated JSON-LD is fed back through the validator and must validate
- [ ] **6.11** Component tests: structured-data tree view, suggestion card with copy-snippet
- [ ] **6.12** E2E (UI): inspect a fixture blog post, confirm `BreadcrumbList` suggestion appears with valid copy-pasteable JSON-LD

**Definition of Done**

- The blog post `/blog/<slug>` on tancrede shows its existing `Article` JSON-LD, validates it, and suggests `BreadcrumbList` if missing.
- The homepage suggests `Organization` + `WebSite` blocks if missing, with copy-pasteable snippets.
- Every suggestion template's generated output validates against schema.org.

---

## Phase 7 — Multi-page crawl + i18n matrix

**Goal**: extend from "one URL" to "a website".

- [ ] **7.1** Crawler in `src/lib/core/crawl.ts`: BFS same-origin links, configurable depth + include/exclude globs
- [ ] **7.2** Auto-discover and follow `hreflang` siblings even when not in nav
- [ ] **7.3** Sidebar grouping by locale (already scaffolded in 3.3)
- [ ] **7.4** "i18n" tab: hreflang reciprocity matrix (visual grid: route × locale). Query the **shadcn studio MCP** for "status grid" / "compatibility matrix" / "heatmap table" patterns first.
- [ ] **7.5** `x-default` presence check, locale code validity
- [ ] **7.6** CLI: `headlint inspect <url> --crawl --depth 2 --include "/blog/**"`
- [ ] **7.7** Performance: in-memory cache + parallel fetches with concurrency cap
- [ ] **7.8** Unit tests: include/exclude glob matching, depth limit, cycle protection (page links back to itself), de-duplication of trailing-slash variants
- [ ] **7.9** Integration test: crawl a multi-page fixture site (4 locales × 3 routes) served by the fixture server; assert exact set of URLs visited and hreflang matrix shape
- [ ] **7.10** Integration test: hreflang reciprocity rule fires correctly on a fixture where `/fr/about` links to `/en/about` but not vice versa
- [ ] **7.11** E2E (CLI): `headlint inspect ... --crawl --depth 2 --include "/blog/**"` produces the expected URL set and respects the include filter
- [ ] **7.12** Component test: i18n matrix renders green/red cells correctly for given snapshot data

**Definition of Done**

- Crawling tancrede with depth 2 captures all 4 locale variants of every route in the matrix.
- The i18n tab shows a green grid for fully reciprocal routes, red cells for any missing alternates.
- Crawler integration tests pass against a multi-page, multi-locale fixture site.

---

## Phase 8 — Configuration system

**Goal**: a single `headlint.config.ts` that controls everything.

- [ ] **8.1** `defineConfig()` helper + Zod schema in `src/lib/config/`
- [ ] **8.2** Config loader: searches CWD for `headlint.config.{ts,js,mjs}`
- [ ] **8.3** Config surfaces: `baseUrl`, `framework`, `i18n`, `crawl`, `rules` (per-rule enable/options), `normalize`, `snapshot.dir`
- [ ] **8.4** `headlint init` — interactive scaffolder using `@clack/prompts` to generate a starter config (CLI). For the in-UI settings panel that mirrors the same fields, query the **shadcn studio MCP** for "settings form" / "config panel" patterns.
- [ ] **8.5** Framework detection: read user's `package.json`, detect `next`/`astro`/`nuxt`/etc., pre-fill framework-aware defaults
- [ ] **8.6** Framework-aware fix snippets: e.g. for Next.js App Router, fix snippets reference `metadata.openGraph.images` in `app/layout.tsx`
- [ ] **8.7** Unit tests: Zod schema validation rejects malformed configs with helpful error messages
- [ ] **8.8** Unit tests: config loader resolves `.ts`, `.js`, `.mjs` variants and finds config from nested CWDs
- [ ] **8.9** Integration test: passing `rules: { "title.length": "off" }` in config disables the rule across both lint runner and UI Issues panel
- [ ] **8.10** Integration test: framework detection correctly identifies Next.js, Astro, Nuxt, and "unknown" against fixture `package.json` files
- [ ] **8.11** E2E (CLI): `headlint init` in a tmp dir produces a parseable config that the loader can read back

**Definition of Done**

- `headlint init` in a fresh Next.js project produces a working `headlint.config.ts` with sensible defaults.
- Disabling a rule in the config makes it disappear from both the UI and the CLI lint output.
- Schema tests cover all valid and the main invalid config shapes.

---

## Phase 9 — Snapshots + CI (the three-lane runner)

**Goal**: ship the regression guard described in our CI design.

- [ ] **9.1** Snapshot format definition in `src/lib/snapshots/types.ts` (route, sample URL, tags array, jsonld types, structuredFields, normalized values)
- [ ] **9.2** Snapshot writer + reader: `.headlint/snapshots/<route>.json`
- [ ] **9.3** Snapshot diff engine: compare two snapshots, classify as `regression` (shape lost) vs `addition` vs `content-drift`
- [ ] **9.4** Normalizer: applies `config.normalize` rules to volatile fields before saving/comparing
- [ ] **9.5** CLI: `headlint snapshot [--update]` — show diff vs committed, or update on disk
- [ ] **9.6** "Snapshot" tab in UI: shows diff vs last committed snapshot, with "Accept changes" button (writes to disk so the dev can commit them). Query the **shadcn studio MCP** for "diff viewer" / "review changes" patterns first.
- [ ] **9.7** Differential rule runner: `headlint ci <url> --base <ref>` runs against the current state and the merge-base, fails only on _new_ errors
- [ ] **9.8** PR comment renderer: HTML output with the four-section format (regressions / new warnings / content diffs / pre-existing). **Renders preview cards as PNGs server-side via Playwright (already in the stack) and embeds them inline, Vercel-style** — this is the viral loop: every engineer who sees a preview-card screenshot in their PR becomes a user. When invoked from `headlint diff` (Phase 9.5), renders local vs prod cards side-by-side in the same comment.
- [ ] **9.9** GitLab CI template (`templates/gitlab-ci.yml`) ready to copy-paste into any project
- [ ] **9.10** GitHub Actions template (`templates/github-actions.yml`)
- [ ] **9.11** `headlint ci` exit codes: `0` = clean, `1` = new errors, `2` = structural regression, `3` = both
- [ ] **9.12** Unit tests: snapshot diff classifier — every transition (added tag, removed tag, content change, JSON-LD type added/removed, structured field added/removed, normalized-volatile change) produces the correct classification
- [ ] **9.13** Unit tests: normalizer — regex replacement, full-field volatile, nested JSON-LD path normalization
- [ ] **9.14** Integration tests: synthetic before/after fixture pairs for each lane:
  - intentional title content edit → no failure
  - accidental `og:image` drop → Lane 2 failure
  - new rule violation introduced by PR → Lane 1 failure
  - rule violation pre-existing on base → reported but no failure
- [ ] **9.15** E2E (CLI): `headlint ci` against a git-backed fixture repo with two commits, asserts exit code matches the introduced lane(s)
- [ ] **9.16** Snapshot test: PR comment renderer output matches a committed Markdown/HTML golden file for each of the four section combinations, **plus visual regression baselines for the rendered preview-card PNGs** and a snapshot for the `headlint diff` (Phase 9.5) localhost-vs-prod side-by-side mode

**Definition of Done**

- A test repo with two commits (one safe, one regressing) produces the expected pass/fail from `headlint ci`.
- The PR comment template renders correctly with mock data.
- Tancrède can adopt the CI step on `develop` without breaking existing pipelines (Lane 1 differential mode covers pre-existing debt).

---

## Phase 9.5 — Localhost vs production diff (the wedge)

**Goal**: ship the unique wedge feature no competitor can do — diff a developer's local meta/preview state against the live production state of the same route.

**Why this exists** (see _Strategy & business model_ above): every other tool inspects either localhost _or_ a deployed URL, never both. Diffing them is the answer to _"your refactor is about to break the OG tags currently live in production"_. Strategically this phase serves three goals at once:

1. **User value**: a deploy-gate that catches regressions before they reach production.
2. **Acquirer demo**: the cleanest possible "buy us" pitch for Vercel / Netlify / Cloudflare — your localhost-vs-prod insight is exactly what makes preview deployments more valuable.
3. **SaaS seed**: the same diff engine, run continuously against deployed snapshots, becomes the v2.x continuous-monitoring product.

- [ ] **9.5.1** Command: `headlint diff <local-url> <prod-url>` — fetches both, runs the engine on each, produces a side-by-side diff. Shares 100% of the engine code with `headlint inspect` and `headlint lint` — this phase adds a comparison layer, not a new extractor.
- [ ] **9.5.2** Diff classifier in `src/lib/core/diff.ts`: per-tag, per-JSON-LD-block, per-rule. Classifies each delta as `lost` (live in prod, missing locally → about-to-regress), `gained` (missing in prod, present locally → about-to-add), `changed` (different value), or `same` (no change).
- [ ] **9.5.3** Smart route mapping: `headlint diff http://localhost:3000 https://tancrede.com` matches `/` ↔ `/` and `/blog/foo` ↔ `/blog/foo` automatically. Optional `--map <local-path>=<prod-path>` for non-trivial mappings (e.g. `--map /preview/blog/foo=/blog/foo`).
- [ ] **9.5.4** UI: new "Diff" tab in the inspect view, shown only when invoked with both endpoints. Visual side-by-side: Raw `<head>`, Issues, Previews. Query the **shadcn studio MCP** for "diff viewer" / "side-by-side comparison" / "split view" patterns first.
- [ ] **9.5.5** Severity ordering in output: lost-rendering-tags first (will visibly break previews), then lost-JSON-LD types (will lose rich snippets), then rule-pass→fail regressions, then content drift.
- [ ] **9.5.6** Crawl-aware mode: `headlint diff <local-url> <prod-url> --crawl --depth 2 --include "/blog/**"` runs the diff across a whole site, reuses Phase 7's crawler.
- [ ] **9.5.7** Exit codes: `0` = no losses, `1` = at least one regression (lost tag / JSON-LD type / rule), `2` = at least one structural break (preview-rendering tag lost), `3` = both. Adoptable as a deploy-gate in CI.
- [ ] **9.5.8** `--json` output schema: stable, documented; consumed by Phase 9.8 PR comment renderer and (later) the SaaS layer.
- [ ] **9.5.9** Unit tests: diff classifier — every transition (tag added / removed / changed, JSON-LD type added / removed, rule pass→fail, rule fail→pass, hreflang sibling lost, manifest changed) produces the correct classification.
- [ ] **9.5.10** Unit tests: route mapper — automatic same-path matching, explicit `--map`, trailing-slash and query-string normalization.
- [ ] **9.5.11** Integration tests: spin up two fixture servers (one as "local", one as "prod") with controlled deltas; assert diff output for each lane (clean / regression / structural break / content drift).
- [ ] **9.5.12** E2E (CLI): `headlint diff` against the fixture server pair on a known-regressing change set; assert exit code, JSON output shape, and that the textual report contains the expected sections.
- [ ] **9.5.13** Component test: Diff tab renders correctly for fixture diff data (clean state, mixed state, all-regressed state).
- [ ] **9.5.14** E2E (UI): inspect view in diff mode renders side-by-side preview cards with the local side visibly degraded for a fixture where the local HTML drops `og:image`.

**Definition of Done**

- `headlint diff http://localhost:3000 https://tancrede.com --crawl --depth 1` produces a clean diff for a no-op change set, and a non-empty regression report when a local refactor drops `og:image` from the homepage.
- The Diff tab in the UI shows side-by-side previews for the homepage, with the local-side visibly degraded.
- Exit codes are deterministic and correct across the test scenarios (clean / regression / structural break / both).
- The `--json` schema is documented at `/rules/diff` (or equivalent) and is treated as a stable contract from this phase forward.

---

## Phase 10 — Watch mode + dev ergonomics

**Goal**: tighten the inner loop so editing `metadata.ts` updates previews live.

- [ ] **10.1** File watcher (`chokidar`) on the user's project root
- [ ] **10.2** WebSocket channel from Next.js server → UI for live updates
- [ ] **10.3** Auto re-fetch + re-lint on detected change; smooth UI update without full reload
- [ ] **10.4** Diff badge in sidebar when a route's metadata changed since last view
- [ ] **10.5** CLI flag: `headlint dev --watch`
- [ ] **10.6** Unit tests: file-watcher debounce/throttle, ignore patterns (`node_modules`, `.next`, `.git`)
- [ ] **10.7** Integration test: WebSocket channel — server pushes a re-fetch event, mock UI client receives expected payload
- [ ] **10.8** E2E (UI): boot `headlint dev --watch` against a fixture site whose HTML is rewritten mid-test; Playwright asserts the preview updates within 2 s without page reload

**Definition of Done**

- Editing `app/[locale]/metadata.ts` in tancrede with `headlint dev --watch` running causes the preview cards to update within ~1s.
- Watch-mode E2E test passes deterministically in CI.

---

## Phase 11 — Packaging & distribution

**Goal**: `npx headlint` works on a fresh machine, anywhere.

- [ ] **11.1** Next.js `output: "standalone"` build target
- [ ] **11.2** `bin/headlint.js` entry point that boots the standalone server in interactive modes, runs the engine directly in CI mode
- [ ] **11.3** `package.json` `bin` mapping, `files` whitelist, `exports` map for `@headlint/core` use
- [ ] **11.4** Lazy Playwright Chromium download: prompt and install on first use of headless mode
- [ ] **11.5** npm publish dry-run; verify install size (<30 MB without Chromium)
- [ ] **11.6** Smoke test script: `npm pack` → install the tarball into a fresh tmp directory → run `headlint inspect`, `headlint lint`, `headlint dev --no-open` against the fixture server → assert exit codes and stdout
- [ ] **11.7** Smoke-test runs in CI as a dedicated `package` stage, gating the release
- [ ] **11.8** Integration test: lazy Chromium download — first headless run in a clean Playwright cache prompts and installs successfully

**Definition of Done**

- `npx headlint inspect <url>` works on a fresh Node 20 install with no project-local setup.
- `npx headlint dev <url>` opens a working browser UI.

---

## Phase 11.5 — Shareable HTML reports (the marketer hand-off)

**Goal**: close the dev-vs-marketer audience gap. Devs run the tool; marketers open a single file. No installs for non-devs, ever.

**Why this exists** (see _Strategy & business model_ above): the product is built for devs, but the people who care about how a page renders on Twitter or in Google SERPs are PMs, content leads and marketers. They will never install Node, never run a CLI, never read JSON. A self-contained HTML report is the cleanest hand-off: a dev runs `headlint inspect --report report.html`, sends the file (or a Slack message), the non-dev opens it in any browser with zero setup. This is also the seed for the v2.x SaaS feature _"publish a private shareable report URL with optional auth"_.

- [ ] **11.5.1** CLI flag plumbing: `--report <path.html>` available on `headlint inspect`, `headlint lint`, and `headlint diff` (Phase 9.5). For crawl mode, the report aggregates all crawled pages into a single navigable file.
- [ ] **11.5.2** HTML report bundler in `src/lib/report/`: produces a single self-contained `.html` file with all assets (CSS, fonts, preview-card PNGs, screenshots, icons) inlined as base64 / data URIs. **Zero outbound network requests when opened**, including in air-gapped environments — verified by test.
- [ ] **11.5.3** Report sections: header card (URL, fetch time, overall status badge), preview gallery (all 10 cards rendered as static images via Playwright, lazy-rendered server-side), issues list (severity-grouped, with fix snippets and copy-to-clipboard), structured-data summary, i18n matrix when applicable, raw `<head>` (collapsed by default).
- [ ] **11.5.4** Marketer-friendly tone: top-level copy avoids dev jargon ("how this page appears when shared" instead of "OG tag lint result"), uses plain-English issue summaries, hides rule IDs and CLI snippets behind a collapsible "for developers" toggle. Both audiences served from the same file.
- [ ] **11.5.5** Diff mode: `headlint diff <local> <prod> --report report.html` produces a side-by-side report — local vs prod preview cards next to each other for every route, regressions visually highlighted. This is the headline artifact a dev sends to a marketer when escalating a deploy decision.
- [ ] **11.5.6** Optional `--report-format json` for downstream consumers (Slack bots, dashboards, the future SaaS ingestion path). The JSON shape mirrors the section structure of the HTML report and is treated as a stable contract.
- [ ] **11.5.7** Branding hooks: `--report-title <string>`, `--report-logo <path>` for white-label scenarios (consultancies running audits for clients). Default branding is the project's own.
- [ ] **11.5.8** Unit tests: HTML bundler — assets are correctly inlined; the produced file passes a strict no-network test (loaded with offline / network-denied browser context, asserts zero failed requests).
- [ ] **11.5.9** Component tests: each report section renders correctly with full / minimal / empty fixture data.
- [ ] **11.5.10** E2E (CLI): `headlint inspect <fixture-url> --report tmp/report.html` produces a file that, when loaded into a network-denied headless browser, contains the expected DOM (preview gallery, issues, sections), with zero failed network requests.
- [ ] **11.5.11** E2E (CLI): `headlint diff --report tmp/diff.html` against the regressing fixture pair produces a report whose DOM contains a "Regressions" section with the expected entries.
- [ ] **11.5.12** Cross-browser smoke: open the produced report in Chrome, Firefox, and Safari (Playwright matrix); assert visual baseline matches.

**Definition of Done**

- A non-developer can open the produced `.html` file in any browser without internet access and see a complete preview/issue report.
- The report renders identically in Chrome, Firefox, and Safari (visual smoke test).
- File size for a typical single-URL report is under 3 MB; under 15 MB for a 20-page crawl.
- A `headlint diff --report` artifact is the artifact a dev sends to their marketer/PM when escalating a deploy decision; this flow is documented in the README.

---

## Phase 12 — Docs site

**Goal**: a marketing + reference site that dogfoods Headlint itself.

- [ ] **12.1** Add a `docs/` folder (or sibling Next.js app) with marketing landing + docs sections
- [ ] **12.2** Pages: Home, Quickstart, Rules reference (auto-generated from rule metadata), CI guide, Config reference, Roadmap. Query the **shadcn studio MCP** for "marketing landing", "docs sidebar", and "API reference list" patterns.
- [ ] **12.3** Live demo embedded on the home page (sandboxed)
- [ ] **12.4** Run Headlint on the docs site itself; pass with zero errors
- [ ] **12.5** Deploy to `headlint.com` via GitLab Pages or Vercel
- [ ] **12.6** Add `headlint lint` step against the docs site to the docs-site CI pipeline; fails on any new error

**Definition of Done**

- The docs site is live at `headlint.com`, all rules documented, quickstart works on a fresh machine in under 60 seconds.

---

## Phase 13 — v1.0 release

- [ ] **13.1** Manual QA pass against `tancrede`, one Astro project, one static HTML site, with screenshots attached to the release MR
- [ ] **13.2** Full test matrix green: unit, component, integration, visual regression, E2E (UI), E2E (CLI), smoke — all stages green on `develop` and on the release MR
- [ ] **13.3** Coverage report attached to release MR; thresholds met or exceeded
- [ ] **13.4** Audit for telemetry: confirm zero outbound calls in default mode (use a network-deny test environment for a final verification run)
- [ ] **13.5** Polish CLI help text, error messages, color output
- [ ] **13.6** CHANGELOG.md curated for the v1 entry
- [ ] **13.7** Run `pnpm release` (commit-and-tag-version) → bumps to `1.0.0`, tags, updates changelog
- [ ] **13.8** Open MR `develop` → `main`, merge after CI green
- [ ] **13.9** Publish to npm as `headlint` (and `@headlint/core` for the engine package)
- [ ] **13.10** Announcement post (blog on tancrede.com + X + Bluesky + Hacker News "Show HN")
- [ ] **13.11** Open `good first issue` items: contribute-a-rule template (with test fixture template)

**Definition of Done**

- `npm view headlint version` returns `1.0.0`.
- A first external user can install, run against their site, and successfully diagnose at least one real metadata issue.

---

## Out of scope for v1 (parked for later)

- LLM-assisted suggestions (planned v1.2)
- Auto-fix codemods (planned v1.3)
- VS Code extension (planned v1.4)
- Browser extension overlay (planned v1.5)
- Hosted SaaS layer: continuous monitoring of deployed sites, regression alerts, shared team configs, public/private shareable report URLs (planned v2.x — see _Strategy & business model_)
- Self-hostable team server with PR bot (planned v2.0)

> **Explicitly _not_ planned**: Headlint will never expand into adjacent linter families (a11y, performance, security, broken-link crawls). Specialization is the moat — see _Strategy & business model_.

---

## Working agreements

- **Branching**: short-lived feature branches off `develop`, MR into `develop`. `develop` → `main` only on tagged releases.
- **Commits**: Conventional Commits (`feat(rules): add og.image.dimensions`).
- **Releases**: `pnpm release` → version bump, changelog, tag.
- **Definition of Done is non-negotiable per phase.** No moving to phase N+1 until N's checkboxes and DoD are green.
- **One PR per phase ideally.** Sub-phases can ship as separate MRs into `develop` if they grow large.
- **Dogfooding cadence**: every phase ends with a run against `tancrede` and a screenshot in the MR description.
- **Component sourcing**: every new UI surface starts with a **shadcn studio MCP** query. The MR description must name the chosen block (or explicitly note "no studio match, composed from primitives"). See the *Component selection* section above.
- **Secrets hygiene**: `.env` is never committed. Any new secret-bearing variable must also be added to `.env.example` with a placeholder value.
