# goflag — Rule Catalog & Spec-Grounded Architecture

> **Status:** phases A–G all shipped · **Last updated:** 2026-08-15
> **Related:** the agent "loop" roadmap (M0 fingerprints/summary — shipped; M1 baseline/diff; M2 source localization; M3 MCP). This document describes the **rule layer** that feeds all of them. The **artefact layer** (sitemap / robots.txt validation) builds on this design and is specified in `docs/sitemap-robots-plan.md` (Phase G below).
>
> **No backward-compatibility constraint.** goflag is pre-1.0. We may **delete the current rule engine, the `Rule`/`Issue` shapes, and the 11 existing rules outright** and rebuild on this design wherever that is cleaner — there is no obligation to port old code, preserve rule ids, or keep report field shapes stable. Choose the cleanest design; regenerate baselines/fingerprints as needed.

## 1. Why this exists

For a developer (and for an AI agent acting on their behalf) three questions matter:

1. **What rule should we follow?** — a comprehensive, _authoritative_ rule catalog.
2. **Where do we stand against it?** — the site's current, observed state vs. that rule.
3. **How do we fix it?** — _deferred on purpose_ (this is the later fix/localization work, M2).

If we nail (1) and (2), a developer can fix, and an agent can understand what to fix. So this plan **strengthens (1) and (2)**: every rule is grounded in a **reliable source of truth**, and the site is reduced to a normalized **observation model** that rules (and agents) compare against.

## 2. Core principle — separate observation from judgment

> goflag **observes** a site into one normalized, provenance-carrying _state_. Rules are **separate objects** that _interpret_ that state.

This single decision is what makes everything else work:

- A **deterministic** rule and an **AI agent** can both read the _same_ evidence.
- The observation model is stable and versionable → M1 diffing is tractable.
- Rules never touch raw HTML; they read documented fields, so they're testable in isolation.

## 3. Rule taxonomy

Not every rule is a boolean, and not every rule has the same authority. Two independent axes:

### 3.1 By determinism (how we evaluate)

| Kind         | Evaluates to                            | Example                                                         |
| ------------ | --------------------------------------- | --------------------------------------------------------------- |
| **boolean**  | `pass` \| `fail`                        | `<title>` present; canonical is absolute; hreflang valid BCP 47 |
| **scored**   | band: `ideal` \| `acceptable` \| `poor` | title/description length within the SERP window                 |
| **presence** | optional; `na` when absent, else scored | `og:image` present and well-formed                              |
| **prose**    | `needs-judgment` (agent decides)        | "the title accurately & compellingly describes the page"        |

For **prose** rules goflag does **not** fabricate a verdict — it attaches the relevant observed facts as an _evidence bundle_ and lets an AI agent (via the future MCP layer) judge the prose against the evidence.

### 3.2 By rigor (how authoritative the source is)

`spec-required` › `spec-recommended` › `vendor-spec` › `guideline` › `heuristic`

This label is the honest expression of "source of truth." An agent must never "fix" a `heuristic` as if it were `spec-required`. Every rule carries its rigor **and** cites ≥1 source from the catalog below.

## 4. Sources of truth

The authoritative references the catalog is built on. Each entry becomes a `Source` record (see §5) with `id`, `publisher`, `rigor`, `url`, `retrievedAt`, and a short quote/paraphrase.

> **Copyright note:** standards bodies (WHATWG, W3C, IETF) are permissively licensed; vendor docs (Google, Apple, Meta, X) are **not** redistributable verbatim. We store a link + `retrievedAt` + a short fair-use quote + our own paraphrase — never full copies. Vendor URLs drift, which is exactly why every entry records `retrievedAt`.

### 4.1 Normative — web standards

| Source                                             | Publisher    | Rigor                | Governs                                                       | Link                                                                             |
| -------------------------------------------------- | ------------ | -------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| HTML Living Standard — the `title` element         | WHATWG       | normative            | `<title>` presence/semantics                                  | https://html.spec.whatwg.org/multipage/semantics.html#the-title-element          |
| HTML Living Standard — the `meta` element          | WHATWG       | normative            | `<meta>` syntax                                               | https://html.spec.whatwg.org/multipage/semantics.html#the-meta-element           |
| HTML Living Standard — standard metadata names     | WHATWG       | normative            | `description`, `viewport`, `theme-color`, `robots`, …         | https://html.spec.whatwg.org/multipage/semantics.html#standard-metadata-names    |
| HTML Living Standard — the `link` element          | WHATWG       | normative            | `<link>` syntax                                               | https://html.spec.whatwg.org/multipage/semantics.html#the-link-element           |
| HTML Living Standard — link types                  | WHATWG       | normative            | `rel` values (`canonical`, `alternate`, `icon`, `manifest`…)  | https://html.spec.whatwg.org/multipage/links.html#linkTypes                      |
| HTML Living Standard — `lang` / `xml:lang`         | WHATWG       | normative            | document language                                             | https://html.spec.whatwg.org/multipage/dom.html#the-lang-and-xml:lang-attributes |
| HTML Living Standard — the `dir` attribute         | WHATWG       | normative            | text direction                                                | https://html.spec.whatwg.org/multipage/dom.html#the-dir-attribute                |
| URL Standard                                       | WHATWG       | normative            | URL parsing/validity                                          | https://url.spec.whatwg.org/                                                     |
| Encoding Standard                                  | WHATWG       | normative            | `charset` / `<meta charset>`                                  | https://encoding.spec.whatwg.org/                                                |
| RFC 3986 — URI Generic Syntax                      | IETF         | normative            | absolute URL structure                                        | https://www.rfc-editor.org/rfc/rfc3986                                           |
| RFC 3987 — IRIs                                    | IETF         | normative            | internationalized URLs                                        | https://www.rfc-editor.org/rfc/rfc3987                                           |
| RFC 5646 / BCP 47 — Tags for Identifying Languages | IETF         | normative            | `hreflang` / `lang` tag validity (case-insensitive!)          | https://www.rfc-editor.org/rfc/rfc5646 · https://www.rfc-editor.org/info/bcp47   |
| RFC 6596 — The Canonical Link Relation             | IETF         | normative            | `rel="canonical"`                                             | https://www.rfc-editor.org/rfc/rfc6596                                           |
| RFC 9309 — Robots Exclusion Protocol               | IETF         | normative            | `robots.txt`                                                  | https://www.rfc-editor.org/rfc/rfc9309                                           |
| Sitemaps XML protocol                              | sitemaps.org | normative            | `sitemap.xml` structure                                       | https://www.sitemaps.org/protocol.html                                           |
| Web Application Manifest                           | W3C          | normative            | `manifest.json` / `<link rel="manifest">`                     | https://www.w3.org/TR/appmanifest/                                               |
| WCAG 2.2                                           | W3C          | normative            | accessibility (lang, alt, contrast…) — _future a11y vertical_ | https://www.w3.org/TR/WCAG22/                                                    |
| WAI-ARIA 1.2                                       | W3C          | normative            | ARIA roles/attributes — _future_                              | https://www.w3.org/TR/wai-aria-1.2/                                              |
| W3C i18n — Language tags in HTML/XML               | W3C          | normative (guidance) | practical BCP 47 usage                                        | https://www.w3.org/International/articles/language-tags/                         |

#### 4.1.1 Licenses of the normative sources — what we may do

The normative sources cluster into four licenses (per publisher). This tells us up front what is safe to embed vs. what must stay a link + paraphrase.

| Publisher / sources                                           | License                  | ✅ We can                                                                                                 | ⛔ We cannot                                                                    |
| ------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **WHATWG** (HTML, URL, Encoding standards)                    | **CC BY 4.0**            | copy, quote, and adapt text freely **with attribution**; embed excerpts; derive rule prose                | omit attribution                                                                |
| **W3C** (Web App Manifest, WCAG 2.2, WAI-ARIA, i18n articles) | **W3C Document License** | reproduce **verbatim with attribution**; quote; write our own paraphrase/implementations                  | publish **modified/derivative** versions of the document text                   |
| **sitemaps.org** (Sitemaps protocol)                          | **CC BY-SA 2.5**         | copy/adapt **with attribution**                                                                           | redistribute an adaptation under a **different** license (share-alike is viral) |
| **IETF** (RFC 3986, 3987, 5646/BCP 47, 6596, 9309)            | **IETF Trust — BCP 78**  | reproduce an RFC **verbatim in full with its notice**; quote; paraphrase; reuse **code components (BSD)** | publish **modified spec text** (derivative works of the prose are restricted)   |

**Default posture regardless of license:** store a **link + `retrievedAt` + a short quote + our own paraphrase** — never bulk-verbatim text. Our paraphrase is original content and is always safe to ship; the license only constrains how much _verbatim_ source text we may reproduce or modify. (Vendor docs in §4.2 — Google, Apple, Meta, X, Bing — are **all-rights-reserved**: link + short fair-use quote + paraphrase only, never redistributed.)

License references: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) · [CC BY-SA 2.5](https://creativecommons.org/licenses/by-sa/2.5/) · [W3C Document License](https://www.w3.org/copyright/document-license-2023/) · [IETF Trust Legal Provisions (BCP 78)](https://trustee.ietf.org/documents/trust-legal-provisions/)

### 4.2 Vendor / de-facto specs

| Source                                        | Publisher   | Rigor       | Governs                            | Link                                                                                                                                                              |
| --------------------------------------------- | ----------- | ----------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Open Graph protocol                       | ogp.me      | vendor-spec | `og:*` tags                        | https://ogp.me/                                                                                                                                                   |
| X (Twitter) Cards — markup                    | X / Twitter | vendor-spec | `twitter:*` cards                  | https://developer.x.com/en/docs/twitter-for-websites/cards/overview/abouts-cards                                                                                  |
| Consolidate duplicate URLs (canonicalization) | Google      | vendor-spec | `rel="canonical"` policy           | https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls                                                                            |
| Robots meta tag & X-Robots-Tag                | Google      | vendor-spec | `robots` meta / header directives  | https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag                                                                                       |
| Intro to robots.txt                           | Google      | vendor-spec | robots.txt behavior                | https://developers.google.com/search/docs/crawling-indexing/robots/intro                                                                                          |
| Localized versions (hreflang)                 | Google      | vendor-spec | hreflang reciprocity, `x-default`  | https://developers.google.com/search/docs/specialty/international/localized-versions                                                                              |
| Influence title links                         | Google      | guideline   | `<title>` content quality          | https://developers.google.com/search/docs/appearance/title-link                                                                                                   |
| Control snippets (meta description)           | Google      | guideline   | meta description usage             | https://developers.google.com/search/docs/appearance/snippet                                                                                                      |
| Intro to structured data                      | Google      | vendor-spec | JSON-LD / rich results eligibility | https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data                                                                        |
| Build & submit a sitemap                      | Google      | guideline   | sitemap best practice              | https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview                                                                                     |
| schema.org vocabulary                         | schema.org  | vendor-spec | structured-data types/properties   | https://schema.org/                                                                                                                                               |
| Configuring web applications (Apple)          | Apple       | vendor-spec | `apple-touch-icon`, web-app meta   | https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html |
| Sharing — webmasters (Open Graph usage)       | Meta        | vendor-spec | OG usage for unfurls               | https://developers.facebook.com/docs/sharing/webmasters/                                                                                                          |
| Bing Webmaster Guidelines                     | Microsoft   | guideline   | crawlability/SEO                   | https://www.bing.com/webmasters/help/webmasters-guidelines-30fba23a                                                                                               |

### 4.3 Practical references, guidelines & cross-check tools

| Source                          | Publisher     | Rigor     | Use                                 | Link                                                                        |
| ------------------------------- | ------------- | --------- | ----------------------------------- | --------------------------------------------------------------------------- |
| MDN — `<meta name>` values      | MDN / Mozilla | guideline | practical meta reference            | https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta/name         |
| MDN — Viewport meta tag         | MDN / Mozilla | guideline | viewport usage                      | https://developer.mozilla.org/en-US/docs/Web/HTML/Viewport_meta_tag         |
| MDN — `<link>` types            | MDN / Mozilla | guideline | rel reference                       | https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/rel            |
| Lighthouse — SEO audits         | Google        | guideline | audit definitions to mirror         | https://developer.chrome.com/docs/lighthouse/seo/                           |
| axe-core — rule descriptions    | Deque         | guideline | a11y rule cross-check               | https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md |
| Nu HTML Checker                 | W3C           | guideline | HTML validity cross-check           | https://validator.w3.org/nu/                                                |
| Title tag best practices        | Moz           | heuristic | title length/quality folklore       | https://moz.com/learn/seo/title-tag                                         |
| Meta description best practices | Moz           | heuristic | description length/quality folklore | https://moz.com/learn/seo/meta-description                                  |

> **Heuristic honesty:** SERP length windows (title ~15–60, description ~50–160 chars) are **heuristics**, not spec. Google states title length is not itself a ranking factor. These rules ship with `rigor: "heuristic"` so agents weight them accordingly.

### 4.4 Today's checks → their sources (to re-express as sourced rules in Phase C)

> These are the _checks_ worth keeping, not the code. Phase C re-expresses them on the new descriptor and discards the old engine; ids may change.

| Rule id                  | Rigor            | Primary source(s)                               |
| ------------------------ | ---------------- | ----------------------------------------------- |
| `title.missing`          | spec-required    | WHATWG `title` element                          |
| `title.length`           | heuristic        | Google title-link · Moz title tag               |
| `description.missing`    | spec-recommended | WHATWG standard metadata names · Google snippet |
| `description.length`     | heuristic        | Google snippet · Moz meta description           |
| `canonical.missing`      | vendor-spec      | RFC 6596 · Google canonicalization              |
| `canonical.absolute`     | vendor-spec      | RFC 6596 · Google canonicalization              |
| `viewport.missing`       | guideline        | MDN viewport · Google mobile guidance           |
| `og.title.missing`       | vendor-spec      | Open Graph protocol                             |
| `og.description.missing` | vendor-spec      | Open Graph protocol                             |
| `og.image.missing`       | vendor-spec      | Open Graph protocol                             |
| `robots.conflict`        | vendor-spec      | Google robots-meta-tag · RFC 9309               |

## 5. Artifact — Source catalog format (`src/rules/sources/`)

```ts
interface Source {
  id: string; // "whatwg-html-title"
  publisher: string; // "WHATWG"
  rigor: "normative" | "vendor-spec" | "guideline" | "heuristic";
  title: string;
  url: string;
  anchor?: string; // section id within the doc
  retrievedAt: string; // ISO date
  quote?: string; // short fair-use excerpt
  note?: string; // our paraphrase (avoids copyright issues)
}
```

CI validates: every URL resolves, every rule cites ≥1 source, and every source has a `rigor`.

## 6. Artifact — Deterministic rule format (`src/rules/`)

A declarative descriptor + a thin pure evaluator that reads the observation model (§7), never raw HTML.

```ts
type Rigor = "spec-required" | "spec-recommended" | "vendor-spec" | "guideline" | "heuristic";

interface RuleBase {
  id: string;
  category: string; // "document" | "meta" | "opengraph" | "i18n" | ...
  title: string;
  why: string; // rationale (today's `summary`)
  rigor: Rigor;
  sources: string[]; // → §5 Source ids (REQUIRED, CI-enforced)
  reads: string[]; // paths into the Extraction model (§7)
  relates?: string[]; // links to related rules
  fixTemplate?: string; // deferred to the fix phase (M2)
}

interface BooleanRule extends RuleBase {
  kind: "boolean";
  severity: Severity;
  evaluate(ex: Extraction): { status: "pass" | "fail"; observed: unknown; expected: unknown };
}

interface ScoredRule extends RuleBase {
  kind: "scored";
  optional?: boolean; // absent → "na", not "fail"
  bands: { ideal: [number, number]; acceptable: [number, number] };
  severityByBand: Record<"acceptable" | "poor", Severity>;
  evaluate(ex: Extraction): {
    status: "pass" | "warn" | "na";
    band?: "ideal" | "acceptable" | "poor";
    observed: number | string;
    expected: string;
  };
}
```

Every result is uniform and self-explaining: **observed vs expected vs source** — points #1 + #2 in one object.

## 7. Artifact — Website extraction / observation model (`src/rules/extraction`)

A rule-agnostic, versioned, provenance-carrying snapshot — the single contract deterministic rules **and** AI agents read. It formalizes what `Page` already captures (values already carry `Sourced<T>` = value + origin + raw).

```ts
interface Fact<T> {
  value: T;
  origin: TagOrigin;
  raw?: string;
}

interface Extraction {
  extractionVersion: number; // bumped on shape change
  http: { status: number; headers: Record<string, string>; redirects: number; finalUrl: string };
  document: {
    title?: Fact<string>;
    lang?: Fact<string>;
    dir?: Fact<string>;
    charset?: Fact<string>;
    base?: Fact<string>;
  };
  meta: {
    description?: Fact<string>;
    viewport?: Fact<string>;
    robots?: Fact<string>;
    canonical?: Fact<string>; /* … */
  };
  openGraph: Record<string, Fact<unknown>>;
  twitter: Record<string, Fact<unknown>>;
  links: {
    hreflang: Fact<unknown>;
    icons: Fact<unknown>;
    manifest?: Fact<unknown>;
    feeds: Fact<unknown>;
  };
  jsonLd: unknown[];
  structure?: { headings: unknown; landmarks: unknown };
  i18n: { cluster: unknown; reciprocity: unknown };
}
```

`Extraction` is **per-page**. Site-level artefacts (robots.txt, the sitemap
tree) get their own versioned observation models — `RobotsExtraction` and
`SitemapExtraction`, specified in `docs/sitemap-robots-plan.md` §3 — read by
site rules exactly the way page rules read `Extraction`.

## 8. Artifact — Prose / advisory rules

goflag emits an **evidence bundle**; the AI agent judges the prose against it.

```ts
interface ProseRule extends RuleBase {
  kind: "prose";
  prose: string; // the rule text, sourced
  evidence: string[]; // extraction paths to attach as context
}

interface AdvisoryFinding {
  ruleId: string;
  prose: string;
  sources: string[];
  evidence: Record<string, Fact<unknown>>; // the observed facts
  verdict: "needs-judgment"; // filled by an agent later
}
```

Advisory findings carry the same stable fingerprint as deterministic ones, so an agent's judgment can be recorded and diffed (M1).

## 9. Profiles / options (`src/rules/profiles/`)

A profile is a named overlay that adjusts severity / requiredness / enabled per rule. Effective rule = descriptor ⊕ active profile. Encodes "a meta isn't always required, but under a business profile it is."

```ts
// profiles: "default" | "strict" | "spec-only" | "marketing" | "content" ...
profile "marketing" {
  "description.missing": { severity: "error" },   // recommended → required
  "og.image.missing":    { severity: "error" }
}
profile "spec-only" { disable all rules with rigor === "heuristic" }
```

Exposed via a `--profile <name>` CLI flag.

## 10. Conformance view (answers "where do we stand", point #2)

An opt-in mode that reports **every rule's status per page** (`pass` / `fail` / `warn` / `na`), not just violations — a rule×page conformance matrix. This is the direct, complete answer to point #2 and the ideal payload for an agent deciding what to work on.

## 11. Phased implementation

| Phase                      | Status     | Deliverable                                                                                                                                                                                                                                                                     |
| -------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Source catalog**      | ✅ shipped | `sources/` data + `Source` type + CI provenance validator (URLs resolve, rigor present); seed with §4                                                                                                                                                                           |
| **B. Extraction model**    | ✅ shipped | Formalize + version + document `Extraction`; adapter from `Page`; schema tests                                                                                                                                                                                                  |
| **C. Deterministic rules** | ✅ shipped | Rule descriptor types (boolean/scored). **Replace the current `RULES` engine outright** and re-express today's ~11 checks as sourced rules (real `sources` + `rigor`) — no obligation to preserve old ids or behavior; delete the legacy engine where cleaner                   |
| **D. Profiles**            | ✅ shipped | Profile overlay + runner composition + `--profile` flag                                                                                                                                                                                                                         |
| **E. Conformance + prose** | ✅ shipped | Opt-in conformance view; `ProseRule` + advisory findings                                                                                                                                                                                                                        |
| **F. Report/loop wiring**  | ✅ shipped | Thread `rigor` / `sources` / `observed` / `expected` into report + `--summary`; keep M1-diff compatible                                                                                                                                                                         |
| **G. Artefact rules**      | ✅ shipped | Sitemap / sitemap-index and full robots.txt validation on the same descriptor: site-level extraction models, RFC 9309 matcher, sourced rules. G.1–G.4 all shipped 2026-08-15, less `sitemap.index.nested`, which no document supports. Full spec: `docs/sitemap-robots-plan.md` |

**Phase D as shipped.** Two levers per rule — `enabled` and `severity` —
overlaid `byRigor` first, then per rule id, in `src/lib/rules/profiles/`. A
profile never touches `rigor` or `sources`: policy decides what fails your
build, not how authoritative a requirement is. Ships `default`, `strict`,
`spec-only` and `marketing`; the report records the active profile, and the
baseline diff reports a mismatch rather than silently comparing two policies
(a warning, never a gate — a cross-profile investigation is legitimate).
§9's third lever, **requiredness**, is deliberately not implemented — whether
an absent optional subject is `na` or a failure lives inside each evaluator,
and hoisting it into the overlay first needs the descriptor to declare its
optional subjects. Cross-page `SiteRule`s are not overlaid yet; they join when
Phase G moves them onto the descriptor.

**Phase F as shipped.** The four fields were produced by `evaluateRules` and
dropped one step later, in `findingsToIssues` — so a report carried a severity
and a message and nothing about how authoritative the requirement was. With 23
sourced page rules that gap is the difference between an agent fixing a
`spec-required` and an agent fixing folklore, which is the single decision the
rigor axis exists to serve.

`Rigor` moves to `core/types.ts` beside `Severity`, for the reason already
written there about `Issue`: it crosses the engine → report → CLI boundary.
Cross-page findings carry it too, stamped from the descriptor rather than from
the check — a rule does not get to claim a rigor per finding — and stay absent
on the three rules that have not declared one, so the catalogue's visible gap
does not quietly close itself. `engine.rule-crashed` carries none either: it is
goflag talking about itself, and there is no document behind it.

**`--summary` is where a human reads it**, because a rollup is one rule, so the
tag costs one line rather than one per finding: `warn title.length [heuristic] ×3`.

**Fingerprints do not move.** They key on the rule, the route and the
occurrence, and `diff.ts` matches a baseline on `id` alone — so enriching a
finding cannot renumber one. `fingerprint.test.ts` now pins two of them
literally, because the day that changes is the day every committed baseline
reports its whole contents as new.

**Phase E as shipped.** Both halves are opt-in flags (`--conformance`,
`--advisories`) and both are omitted from the report entirely when not asked
for — an empty `advisories: []` would claim goflag had looked and found
nothing to ask, which it has not. Each page is projected and evaluated once;
violations, matrix and advisories are three narrowings of that single pass.

- **Conformance** (`src/report/conformance.ts`) carries rule metadata once in
  a legend and bare statuses per cell, so a 200-page grid stays readable by an
  agent. `pass + fail + warn + na + crashed` always equals the page count —
  `crashed` exists so the arithmetic closes. A rule the active profile
  switched off is absent rather than all-zero: "not run" and "never applied"
  are different claims, and only the second is `na`.
- **Prose rules** (`src/lib/rules/prose.ts`, `advisory.ts`) ship four
  questions, kept out of the deterministic `Rule` union so no consumer can
  mistake one for a verdict. §8's `evidence` field is the inherited `reads` —
  for a prose rule the two collapse, and one field beats two kept in sync; the
  consumer-facing name survives on `AdvisoryFinding`. Absent observations
  appear in the bundle as `null` rather than missing keys, since "no
  `og:image`" is itself evidence.
- One deviation from §8: a prose rule declares an `appliesTo` gate and is
  asked only where its subject exists. Asking "does the description summarize
  the page?" where there is no description stacks an unanswerable question on
  top of the deterministic finding that already covers it. The gate tests
  presence only — never quality, which would be goflag making the judgment it
  declined to make.

Each phase ships independently: tests + full gate (lint, typecheck, format, build) → MR to `develop`.

**Sequencing:** this is the build-out of points #1/#2. It slots ahead of broadly expanding rules, is orthogonal to **M1 (diff)** (and makes it richer), and leaves **M2 (fix)** deferred — matching "handle the last step at the end." Start with **Phase A**. Phase G is the first _expansion_ of the catalog once the machinery exists — it exercises the descriptor on site-level subjects and retires the never-wired `SitemapDiagnostics` analysis fields.

## 12. Open decisions (current defaults)

- **Ingestion:** curated catalog + CI-enforced provenance (not automated spec-prose extraction — too error-prone to trust).
- **Conformance:** ship the conformance view (opt-in) so point #2 is fully answered.
- **First scope:** rebuild the rule system on the new format from scratch — re-express today's checks as sourced rules rather than mechanically porting. Deleting the legacy engine, changing rule ids, and reshaping report fields are all fine (pre-1.0, no back-compat).

## 13. Glossary

- **Normativity / rigor** — how authoritative a rule's source is (`spec-required` … `heuristic`).
- **Observation / extraction** — the normalized, rule-agnostic snapshot of a page.
- **Deterministic rule** — evaluates to pass/fail/band mechanically.
- **Prose / advisory rule** — presented with evidence for an AI agent to judge.
- **Profile** — a named policy overlay adjusting severity/requiredness.
- **Fingerprint** — the stable id (M0) that lets findings be diffed across runs.
