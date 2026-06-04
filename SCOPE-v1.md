# goflag — v1 shippable scope

> **Living document.** The cut line for the first public release. Decides what ships in v1 (un-parked) vs what stays deferred. Companion: [`ATTACK-PLAN.md`](./ATTACK-PLAN.md) (execution), [`PLAN.md`](./PLAN.md) (full engineering plan), [`BRANDING-AND-STRATEGY.md`](./BRANDING-AND-STRATEGY.md) (the why).
>
> This closes **Phase 0.4** of the attack plan.

## v1 in one sentence

> **A local, three-lens site auditor you run with one command — paste a base URL, get sitemap, `<head>`, and link audits in a beautiful local UI, then share a single self-contained report. No account, no telemetry.**

The goal of v1 is **adoption and reputation** (objectives O1-O3), not monetization. Everything that serves "a delightful, installable, shareable local tool" is in; everything that serves the resale/wedge thesis (O4) is gated behind post-launch traction.

---

## ✅ In v1 — already built (keep)

The engine + UI are done and green (Phases 3-8 + the Suite):

- **Three lenses** over one shared crawl: **Sitemap** (`/site`), **Head** (`/inspect`), **Links** (`/links`), plus the unified entry → `/dashboard`.
- **Preview cards** — 11 platforms (Google SERP, X, Facebook, LinkedIn, Discord, Slack, WhatsApp, iMessage, Pinterest…) with "what if I remove this tag?" toggles.
- **Rule engine** — 25 MVP rules with per-rule docs at `/rules/<id>`, severity-grouped Issues panel.
- **JSON-LD intelligence** — validity tree + schema-aware suggestions with copy-paste snippets.
- **Multi-page crawl + i18n** — hreflang reciprocity matrix, locale validity.
- **Config system** — `goflag.config.{ts,…}` with `defineConfig()`, framework detection, rule toggles.
- **No telemetry**, localhost-first, engine cleanly separable (`src/lib/core/**`).

## 🟢 In v1 — to un-park (the three Phase 1-2 deliverables)

1. **One-command distribution — `npx goflag [url]`** _(PLAN Phase 11.1-11.3)_
   A **thin `bin/` shim** that boots the Next.js `output: "standalone"` server and opens the browser to the dashboard. This is the keystone: it keeps the localhost-first wedge **and** gives frictionless dev distribution.
   _Not_ the full historical command tree (`inspect/lint/snapshot/ci/diff`) — just the boot shim. Terminal-native subcommands are a post-v1 call (see below).

2. **Shareable, self-contained HTML report** _(PLAN Phase 11.5 — the one viral hook)_
   `npx goflag [url] --report report.html` → a single offline `.html` (assets inlined, zero network on open) with the preview gallery + issues + structured-data summary. This is the marketer/PM hand-off and the share artifact that drives installs. **We pick this as the single Phase 2 hook** (PR-bot and prod-diff are heavier and gated).

3. **Landing page + hosted live demo on `goflag.tech`** _(PLAN Phase 12, trimmed)_
   A marketing landing + an instant sandboxed demo (no install) so the launch link converts. Full docs site can grow after launch; the landing + demo are the v1 minimum.

## 🟢 In v1 — branding polish

- Racing-flag **verdict vocabulary** wired into the UI/report: 🟢 green / 🟡 yellow / 🔴 red flag (+ 🏁 checkered for a clean run). _(Attack plan 2.3.)_
- README with a punchy demo GIF + preview cards front and center.

---

## 🔴 Out of v1 — deferred / gated

Cut from the first release. Most are **gated behind the Phase 3 post-launch traction gate** (do not build until adoption justifies it).

| Deferred                                                         | Why it waits                                                                 |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Localhost-vs-prod diff** (`goflag diff`, PLAN 9.5)             | The wedge (O4). Heavy. Gated — Attack-plan Phase 4.                          |
| **PR-bot with rendered preview cards** (PLAN 9.8)                | The viral loop for teams. Gated — Phase 4.                                   |
| **CI / differential runner** (`goflag ci`, PLAN 9.7-9.16)        | Deploy-gate use case. Depends on terminal CLI + diff. Gated.                 |
| **Snapshots regression guard** (PLAN 9, beyond the shipped 9a)   | Differential runner territory. Parked.                                       |
| **Terminal-native subcommands** (`lint`/`inspect` with `--json`) | Possible fast-follow, but v1 bets on the UI + shared report. See fork below. |
| **Watch mode** (`goflag dev --watch`, PLAN 10)                   | Inner-loop ergonomics. Nice-to-have, post-v1.                                |
| **Full docs site** (PLAN 12 beyond landing+demo)                 | Grows after launch.                                                          |
| **Hosted SaaS** — monitoring, prod-diff history, team configs    | v2.x. Contradicts the no-telemetry, ship-fast v1 ethos.                      |
| **LLM suggestions / codemods / VS Code / browser ext**           | v1.2+ roadmap.                                                               |

**Permanently out of scope (the moat is depth):** accessibility, performance, security. goflag stays in the discoverability / presentation / integrity story.

---

## The one open fork (flag for decision)

**Does `npx goflag` also print results in the terminal?**

- **v1 bet (chosen):** `npx goflag` boots the **UI**; the shareable **HTML report** is the headless artifact. Simplest, leans on the visual "wow".
- **Alternative:** also expose `npx goflag lint <url> --json` for terminal/CI users. Lower effort than the full diff/CI lanes, and some devs expect terminal output — but it edges toward the gated Phase 4 deploy-gate story.

Default: ship the UI + report for v1; revisit terminal subcommands right after launch based on what people ask for.

---

## v1 Definition of Done

- `npx goflag http://localhost:3000` works on a clean Node 20 machine and opens the dashboard (sitemap + head + links).
- `npx goflag http://localhost:3000 --report report.html` produces a single offline file a non-dev can open with zero setup.
- `goflag.tech` serves a landing page + a working sandboxed demo.
- README sells it in 10 seconds (GIF + preview cards), verdict vocabulary is the racing flags.
- All gates green (lint, typecheck, ~671+ tests, build, CI pipeline).
- Zero telemetry verified in a network-denied run.

When all of the above are true and the launch (Attack-plan Phase 3) is live across 3+ channels, v1 is shipped and the Phase 3 traction gate decides whether Phase 4 (the wedge) begins.
