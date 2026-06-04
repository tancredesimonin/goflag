# Dr. Ping — Attack Plan

> **Living document.** The step-by-step plan to take the project (currently `headlint`) from a local web app to a launched, distributable OSS dev tool under the **Dr. Ping** brand. Check items as we ship. Keep this in sync with commits so the trail is auditable.
>
> Companion docs: [`BRANDING-AND-STRATEGY.md`](./BRANDING-AND-STRATEGY.md) (the why + the brand), [`PLAN.md`](./PLAN.md) (the engineering build plan), [`SPEC-suite.md`](./SPEC-suite.md) (the three-lens technical spec).

## How to use

- Work phases **in order**. The critical path is **0 → 1 → 3**; phases 2, 4 and 5 are amplifiers.
- Each phase has a **Definition of Done (DoD)** and the **objectives it serves** (see legend).
- **Two golden rules** (non-negotiable):
  1. **Nothing in Phase 4-5 gets built before the Phase 3 traction gate is passed.** This protects the near-certain wins (objectives 1-3).
  2. **The rename (Phase 0) is blocking** — no public footprint before it's done, or we fragment GitHub stars / SEO / npm.

## Objectives legend

| Tag | Objective | Note |
| --- | --- | --- |
| **O1** | Strengthen tech reputation | "I can build a relevant, practical dev tool." |
| **O2** | Bias to action | "I had a problem, I solved it — look." |
| **O3** | Give back to the dev community | OSS, free forever. |
| **O4** | Upside: demand → traffic → resale | **Optional.** A side effect of O1-O3, never a primary driver. See strategy doc. |

## Status legend

`[ ]` todo · `[~]` in progress · `[x]` done · `[-]` cut/deferred

---

## Phase 0 — Identity & scope freeze · _Week 0_ · serves O1 O2 O3 O4

**DoD:** Test suite green under the new name · zero references to "headlint" · v1 scope written down.

- [ ] **0.1** Lock the name **Dr. Ping** across identifiers: npm `drping`, GitHub org `drpinghq`, domain `drping.dev` (+ `drping.sh` optional).
- [ ] **0.2** Rename the codebase: package name, `@headlint/core` → `@drping/core`, routes (`/site` `/inspect` `/links` → `/scan` `/vision` `/circulation`), `headlint.config.ts` → `drping.config.ts`, `.headlint/` dir, all docs and copy.
- [ ] **0.3** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all green after the rename (~700 tests).
- [ ] **0.4** Write the v1 "shippable" scope: what we un-park (CLI packaging, hosted demo) vs what stays cut (SaaS, monitoring).

> **Note:** the rename touches a heavily-tested codebase. Do it in one focused pass; keep it bounded (no feature work mixed in).

---

## Phase 1 — Make it distributable · _Weeks 1-2_ · serves O1 O2 O3 O4

**DoD:** `npx drping http://localhost:3000` works on a clean Node 20 machine · live demo on `drping.dev`.

- [ ] **1.1** Un-park the packaging (PLAN Phase 11): `bin/` entry point, Next.js `output: "standalone"`, `npx` distribution.
- [ ] **1.2** Verify `npx drping <url>` end-to-end on a fresh machine (no project-local setup).
- [ ] **1.3** Landing page + instant hosted demo on `drping.dev` (PLAN Phase 12).

> **Why this is the keystone:** the localhost-first wedge fights against hosted paste-URL distribution. `npx drping` is the only surface that keeps the wedge **and** gives frictionless dev distribution.

---

## Phase 2 — One viral hook · _Weeks 2-3_ · serves O1 O3 O4

**DoD:** a dev runs it → shares one beautiful image/report with zero installs for the recipient.

- [ ] **2.1** Shareable, self-contained HTML report (PLAN Phase 11.5).
- [ ] **2.2** README with a punchy demo GIF + the preview cards front and center.
- [ ] **2.3** Polish the verdict vocabulary: **Clean bill of health / Symptoms / Critical**.

> Pick **one** hook. The PR-bot and the prod-diff are heavier and deferred to Phase 4.

---

## Phase 3 — Launch · _Week 4_ · serves O1 O2 O3

**DoD:** public announcement live across 3+ channels · contribution template in place. **This is the traction gate for Phases 4-5.**

- [ ] **3.1** Blog post on `tancrede.com`: the problem → solution story (this is literally O2 realized).
- [ ] **3.2** Show HN + X + Bluesky.
- [ ] **3.3** "good first issue" set: a contribute-a-rule template with test fixture (O3).

**Traction gate (decide before building Phase 4):** are stars/installs/inbound trending up enough to justify the heavy wedge work? If not, iterate on O1-O3, do **not** start Phase 4.

---

## Phase 4 — The wedge · _Week 5+ · GATED on traction_ · serves O4

**DoD:** adopted as a deploy-gate by ≥ 1 external team.

- [ ] **4.1** localhost-vs-production diff (PLAN Phase 9.5) — the unique wedge.
- [ ] **4.2** PR-bot with rendered preview cards (PLAN Phase 9.8) — the viral loop.

---

## Phase 5 — Monetization · _GATED on traction_ · serves O4

**DoD:** concrete inbound or a paid pilot.

- [ ] **5.1** Approach a CMS / deploy platform for **sponsorship or integration** (not acquisition).
- [ ] **5.2** Build the SaaS monitoring layer **only if** demand is demonstrated.

---

## Critical path & success metrics

**Critical path:** Phase 0 → 1 → 3. If only three things get done: **rename it, make it `npx`-able, launch it with a story.**

| Objective | How we know it's working |
| --- | --- |
| **O1 — Reputation** | GitHub stars, organic mentions, inbound (jobs/consulting/speaking), perceived artifact quality. |
| **O2 — Action** | Binary: shipped + launched publicly. Yes/no. |
| **O3 — Community** | External contributors, rules contributed, "this helped me" feedback. |
| **O4 — Upside** | CI adoption, retention, platform inbound. **Leading indicators, not a target to chase.** |
