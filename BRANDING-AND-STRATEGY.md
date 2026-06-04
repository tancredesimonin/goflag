# Dr. Ping — Branding & Strategy

> **Living document.** Captures the brand identity and the product strategy so the rationale is tracked alongside the code. Companion: [`ATTACK-PLAN.md`](./ATTACK-PLAN.md) (the step-by-step execution).
>
> **Note on visibility:** this file is candid about a possible resale/partnership. If/when the repo goes public, review whether the resale framing should stay or move to a private note.

---

## 1. Identity

**Name:** **Dr. Ping** (display form always written with the space + period).

**Why the rename from `headlint`:** `headlint` only describes **one** of the three lenses. The product now audits the **sitemap**, the **`<head>`**, _and_ the **links** of a site. The umbrella name had to cover the whole.

**Tagline:** _« Catch it local. Ship it healthy. »_

**Sub-tagline:** _« Dr. Ping ausculte ton site en local et le déclare apte au déploiement. »_
_(EN: "Dr. Ping examines your site locally and clears it for deployment.")_

**The double meaning that powers the brand:** _ping_ = the network ping (does the page respond?) **and** the EKG monitor beep (the heartbeat). One word, two readings — preventive medicine for websites.

---

## 2. The problem it solves (product framing)

Not "diagnose a sick site" (curative) but **immunize a site before it ships** (preventive): catch all HTML/SEO bugs — broken links, dead sitemap, bad `<head>` — **locally, before they reach production**. A vaccine, not a cure. No bug ever reaches your users.

This reframing is the north star: every feature should serve "catch it before prod, locally."

---

## 3. The three exams (lenses)

The three lenses are renamed as medical exams — distinct metaphors, intuitive, and they tell the story better than "sitemap/head/links."

| Lens (engine) | Exam            | What it auscultates                                         |
| ------------- | --------------- | ----------------------------------------------------------- |
| Sitemap       | **Scan**        | The full-body scan: is everything discoverable and healthy? |
| Head          | **Vision**      | How each page is _seen_ (Google, social networks).          |
| Links         | **Circulation** | Does blood flow between pages? (a broken link = a clot)     |

---

## 4. CLI surface

```bash
drping example.com               # full check-up
drping scan example.com          # sitemap
drping vision example.com        # head / meta
drping circulation example.com   # links
```

**Verdict vocabulary** (instead of pass/warn/error):

- **Clean bill of health** — all good
- **Symptoms** — worth watching
- **Critical** — treat before deploying

---

## 5. Visual identity

- **Motif:** an EKG/heartbeat line whose peaks are page/link nodes. Each "beep" is a ping (network + cardiac double meaning).
- **Palette:** clinical white + vital green / alert red. Accent used sparingly.
- **Logo direction:** stethoscope glyph, or the pulse line forming a "P".

---

## 6. Availability (reservations)

| Identifier  | `drping`                         | Status                   |
| ----------- | -------------------------------- | ------------------------ |
| npm package | `drping`                         | Free                     |
| GitHub org  | `drpinghq` (bare `drping` taken) | Free                     |
| Domain      | `drping.dev`                     | Free (primary)           |
| Domain      | `drping.sh`                      | Free (optional, CLI nod) |
| Domain      | `drping.com`                     | Taken (~$699k — skip)    |

**Spelling decision:** brand = **Dr. Ping**; identifiers = `drping` (short, slick CLI/npm string). The bare GitHub handle `drping` is taken, so the org is `drpinghq`. Hyphenated forms (`dr-ping`, `doctor-ping`) rejected — bad for recall/oral spelling. `doctorping` was the only fully-consistent-everywhere alternative (kept as a fallback).

---

## 7. Positioning (inherited from PLAN.md)

> **"Lighthouse for the `<head>`"** — preview and lint how your site appears in search and social, locally, in your browser. Now extended to a **three-lens local site auditor** (Scan / Vision / Circulation).

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

Drop resale as the steering goal; **ship `npx drping` + a hosted demo + a narrative launch**, and let reputation (O1) be the real "exit." O1-O3 are reachable in weeks; O4 may follow as a consequence — never by aiming at it directly.
