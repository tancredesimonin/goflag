# goflag — Branding & Strategy

> **Living document.** Captures the brand identity and the product strategy so the rationale is tracked alongside the code. Companion: [`ATTACK-PLAN.md`](./ATTACK-PLAN.md) (the step-by-step execution).
>
> **Note on visibility:** this file is candid about a possible resale/partnership. If/when the repo goes public, review whether the resale framing should stay or move to a private note.

---

## 1. Identity

**Name:** **goflag** (display form always lowercase, one word).

**Why the rename from `goflag`:** `goflag` only describes **one** of the three lenses. The product now audits the **sitemap**, the **`<head>`**, _and_ the **links** of a site. The umbrella name had to cover the whole.

**Tagline:** _« Catch the red flags. Get the green flag. »_

**Sub-tagline:** _« A local, three-lens site auditor that waves you off before the bugs reach prod. »_

Short variants: _« Green-flag your deploy. »_ · _« No red flags before you ship. »_

**The double meaning that powers the brand:** _red flags_ = warning signs / things that are wrong, **and** _green flag_ = the motorsport start signal ("the track is clear — go"). One metaphor, a whole verdict system for free.

---

## 2. The problem it solves (product framing)

Not "diagnose a broken site after the fact" but **catch the bugs before the site ships**: broken links, dead sitemap, bad `<head>` — found **locally, before they reach production**. Prevention, not cleanup. No bug ever reaches your users.

This reframing is the north star: every feature should serve "catch it before prod, locally."

---

## 3. The three lenses

Three independent passes over the same crawl, each with its own verdict:

| Lens        | What it checks                                                         |
| ----------- | ---------------------------------------------------------------------- |
| **Sitemap** | Is everything discoverable? Is the sitemap coherent and reachable?     |
| **Head**    | How each page is _seen_ by Google and social networks (`<head>`/meta). |
| **Links**   | Does everything connect? (broken/dead links between and out of pages)  |

---

## 4. CLI surface

```bash
goflag                      # audit localhost, all three lenses
goflag https://localhost:3000
goflag --ci                 # exit non-zero on a red flag → deploy gate
goflag head|links|sitemap   # run a single lens
```

Output: a per-lens recap + one global flag verdict.

**Verdict vocabulary** (racing flags — intuitive and coherent):

- 🟢 **Green flag** — all clear, the track is yours, ship it.
- 🟡 **Yellow flag** — non-blocking warnings, proceed with caution.
- 🔴 **Red flag** — blocking issues, stop and fix before you push.
- 🏁 **Checkered flag** — a clean run finished with zero problems (the "all good" badge).

---

## 5. Visual identity

- **Motif:** a minimal green flag / pennant, or a stylized checkered flag. Flat, sharp, motorsport-grade.
- **Palette:** dark dev background + **racing green (#16a34a)** as the single accent; red/yellow reserved for verdicts.
- **Wordmark:** `goflag` in lowercase monospace.
- **Tone:** dry, engineering/motorsport — **not** cartoon. Restraint is what keeps it from feeling gimmicky.

---

## 6. Availability (reservations)

| Identifier  | `goflag`      | Status                   |
| ----------- | ------------- | ------------------------ |
| npm package | `goflag`      | Free                     |
| GitHub org  | `goflag`      | Free                     |
| Domain      | `goflag.tech` | **Registered** (primary) |
| Domain      | `goflag.sh`   | Free (optional, CLI nod) |

**Spelling decision:** brand and all identifiers are the single lowercase token `goflag` — a clean sweep across npm + GitHub + domains, which is rare. No hyphens, no casing rules, nothing to misspell out loud. Primary domain registered on `.tech`.

**Why `goflag` over the alternatives:** "vedette" single words (greenlight, takeoff, liftoff…) and short dictionary words are almost all camped or premium on npm/`.dev`. `goflag` keeps the green-light/go-signal energy, stays short (6 letters, one block), and is available everywhere. Sober coined fallbacks considered and rejected for being less self-explanatory: `spekt`, `nitid`, `scruto`, `skopo`.

---

## 7. Positioning (inherited from PLAN.md)

> **"Lighthouse for the `<head>`"** — preview and lint how your site appears in search and social, locally, in your browser. Now extended to a **three-lens local site auditor** (Sitemap / Head / Links).

**Whitespace:** nobody owns "the dev-grade linter for how a site appears in search and social, runnable on localhost, with rules + fixes + framework-aware suggestions." Paste-URL tools are marketer-leaning and post-deploy; SEO crawlers are broad and shallow on `<head>`; Lighthouse's SEO tab is an afterthought.

**The moat is depth, not breadth.** Deliberately out of scope forever: a11y, performance, security. Specialization is the moat.

---

## 8. Strategy

### The four goals — two incompatible families

| Goal                           | Family                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| O1 — tech reputation           | **Reputation / action / community.** Won by shipping a delightful, installable tool + launching it well. No business required. |
| O2 — bias to action            | ↑ same family                                                                                                                  |
| O3 — give back to community    | ↑ same family                                                                                                                  |
| O4 — demand → traffic → resale | **Business with traction.** A lottery ticket, not a plan.                                                                      |

**The trap:** letting O4 push us to over-build (SaaS, monitoring, acquisition-readiness) and under-ship, sacrificing the near-certain O1-O3.

### The resale challenge (O4)

An acquirer (Vercel / Netlify / Cloudflare / Sanity / Contentful) buys one of four things:

| Lever                  | What they buy                              | Realism here                                      |
| ---------------------- | ------------------------------------------ | ------------------------------------------------- |
| 1. Distribution        | Thousands of devs already using it         | Plausible if we nail O1-O3                        |
| 2. Strategic wedge     | A defensive capability (localhost-vs-prod) | Possible — Phase 4                                |
| 3. Talent (acqui-hire) | They hire you; the repo is the CV          | Common for solo dev tools                         |
| 4. Revenue             | Meaningful ARR                             | Unlikely — ceiling is "low-single-digit millions" |

**Consequence:** for 3 of the 4 levers, **adoption and reputation ARE the asset.** So even if optimizing for resale, the optimal sequence is identical to optimizing for reputation: **adoption first, monetization later.**

**Reframe of O4:** don't build _for_ the sale. Build for **reputation + optionality.** The likely payoffs are inbound opportunities (O1 realized) or a sponsorship/partnership — not an acquisition. The "traffic to resell" model contradicts the no-telemetry ethos and is dropped.

### Gates to make a resale credible

- **Distribution:** > 2-3k GitHub stars, rising npx/npm installs, organic mentions.
- **Wedge works:** localhost-vs-prod diff adopted as a deploy-gate by real teams.
- **Retention:** people re-running it week over week (hard without the CI layer).
- **Timing:** an acquirer has a reason _now_ — the tool makes their preview deployments more valuable.

### Business model (from PLAN.md, for reference)

1. **OSS CLI + engine** — free forever, permissive license, lives in CI. The durable artifact.
2. **Hosted SaaS layer** (v2.x, deferred) — continuous monitoring, prod-diff history, team configs, shareable reports.
3. **Acquisition target** (the optional exit) — deploy platforms / headless CMSes are the natural acquirers; engine + hosted layer kept cleanly separable.

---

## 9. One-line strategy

Drop resale as the steering goal; **ship `npx goflag` + a hosted demo + a narrative launch**, and let reputation (O1) be the real "exit." O1-O3 are reachable in weeks; O4 may follow as a consequence — never by aiming at it directly.
