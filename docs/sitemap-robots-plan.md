# goflag — Sitemap & robots.txt Validation Spec

> **Status:** planning · **Written:** 2026-08-06
> **Related:** `docs/rules-catalog-plan.md` — this document is the **artefact
> layer** built on that design. It lands **after** the rule-catalog build-out
> (it needs the source catalog, the rule descriptor, and the extraction model)
> and is scheduled there as **Phase G**.
>
> **No backward-compatibility constraint** (same posture as the rule catalog):
> pre-1.0, existing ids (`robots.blocks-site`, `hreflang.sitemap-mismatch`) and
> the `SitemapDiagnostics` shape may be re-expressed or deleted outright.

## 1. Why this exists

goflag already **reads** `sitemap.xml` and `robots.txt` — it does not **judge**
them. Today:

- `discoverSitemap()` locates the sitemap (robots declaration → well-known
  paths), follows indexes, inflates gzip, and collects diagnostics — but every
  problem it notices dies in `diagnostics.warnings`, a string array no gate
  ever reads.
- `SitemapDiagnostics` declares a "strengthened analysis" block (`reachable`,
  `orphanCount`, `lastmodIssues`, `mixedProtocol`, `mixedHost`,
  `robotsConflicts`) that **nothing populates** — the `analyzeSitemapHealth`
  routine named in the comment was never written. This is the "signal
  collected and never judged" failure mode documented in
  `docs/spec-and-lib-plan.md` §4, third occurrence and counting.
- `probeRobots()` extracts `Sitemap:` lines and a single `blocksAll` boolean.
  The only judgments are `robots.blocks-site` (site rule, `Disallow: /` only)
  and `robots.conflict` (per-page meta/header contradiction). Everything else
  in the file — syntax errors, per-path rules, invalid sitemap declarations —
  is invisible.

Both artefacts have real, normative specs (RFC 9309; sitemaps.org protocol),
which makes them the **best-sourced rules in the whole catalog** — better
grounded than most `<head>` checks. Auditing them is squarely inside the
product thesis: defects invisible in a browser, expensive in search.

## 2. Scope and non-goals

**In scope**

- Full parse of `robots.txt` per RFC 9309, with line-level provenance.
- Full parse of the sitemap tree (urlset, sitemapindex, gzip) with per-entry
  and per-document provenance.
- A reusable RFC 9309 **path matcher** (wildcards, longest-match, allow-wins).
- Deterministic rules over both artefacts, sourced and rigor-labelled per the
  rule-catalog design.
- Cross-artefact rules: robots ↔ sitemap ↔ crawled pages.

**Out of scope**

- `Crawl-delay` semantics (non-standard; Google ignores it — we flag it as
  unknown-directive at most, we do not model it).
- Per-bot behavioral differences beyond the `*` group (we evaluate the file,
  not simulate Googlebot vs Bingbot).
- Sitemap extensions (image/video/news namespaces): entries are collected via
  `<loc>` as today; validating extension payloads is a later vertical.
- `manifest.json`, `llms.txt` and other well-known files — same architecture,
  separate plans (llms.txt is phase 6 of `spec-and-lib-plan.md`).

## 3. Extraction — site-level observation models

The rule-catalog `Extraction` (§7 there) is **per-page**. These artefacts are
**per-site**, so they get their own versioned, provenance-carrying models,
read by site-level rules exactly the way page rules read `Extraction`. They
replace the ad-hoc `RobotsProbe` and grow `SiteDiscovery` rather than
duplicating it.

### 3.1 `RobotsExtraction`

The parse keeps everything, including what it could not understand — a syntax
rule needs the rejected line and its number, not a boolean.

```ts
interface RobotsExtraction {
  robotsVersion: number; // bumped on shape change
  url: string;
  /** 0 on network error. */
  status: number;
  /** Redirect hops followed (RFC 9309 §2.3.1.2 allows following them). */
  redirects: { count: number; finalUrl: string; crossOrigin: boolean };
  /** Raw bytes length — the 500 KiB parsing limit is about bytes, not chars. */
  byteLength: number;
  /** Parsed groups in file order. */
  groups: RobotsGroup[];
  /** `Sitemap:` records (independent of groups per RFC 9309 §2.2.4). */
  sitemaps: { value: string; line: number }[];
  /** Lines that parsed as nothing: typos, rules outside a group, junk. */
  invalidLines: { line: number; raw: string; reason: string }[];
  /** Non-standard but recognisable directives (crawl-delay, host, …). */
  unknownDirectives: { name: string; line: number }[];
}

interface RobotsGroup {
  /** Product tokens, lowercased (matching is case-insensitive). */
  userAgents: { value: string; line: number }[];
  rules: { kind: "allow" | "disallow"; pattern: string; line: number }[];
}
```

### 3.2 `SitemapExtraction`

Grows out of `SiteDiscovery` — same discovery routine, but the result keeps
the **document tree** (root + children with their own status/size/parse
outcome) instead of flattening everything into one warnings array.

```ts
interface SitemapExtraction {
  sitemapVersion: number;
  /** How the root was found: robots declaration, well-known path, or absent. */
  discoveredVia: "robots" | "well-known" | "none";
  root?: SitemapDocument;
  /** Children of an index, in declared order (bounded by maxSitemaps). */
  children: SitemapDocument[];
  /** All collected entries with a pointer back to their document. */
  entries: SitemapEntry[];
  truncated: boolean;
}

interface SitemapDocument {
  url: string;
  status: number;
  byteLength: number; // uncompressed
  gzipped: boolean;
  kind: "urlset" | "index" | "unparsable";
  /** For an index: `<loc>` values of referenced sitemaps. */
  childLocs: string[];
  urlCount: number;
  declaredInRobots: boolean;
}

interface SitemapEntry {
  loc: string; // verbatim <loc>
  lastmod?: string; // verbatim
  changefreq?: string; // verbatim
  priority?: string; // verbatim
  documentUrl: string; // which sitemap file declared it
}
```

Verbatim fields are deliberate: rules judge the declared value (`lastmod`
malformed, `priority` out of range), so normalizing at extraction time would
violate "never judge what you have altered" (`spec-and-lib-plan.md` §4).

### 3.3 The RFC 9309 matcher (`core/robots/match.ts`)

A pure function, shared by every rule that asks "does this robots.txt block
this URL?" — required for `robots.blocks-page` and
`sitemap.entry.blocked-by-robots`, and reused later when the crawler itself
learns to respect robots rules.

Semantics to implement, each with a dedicated test:

| Behavior          | RFC 9309                                                        |
| ----------------- | --------------------------------------------------------------- |
| Group selection   | most specific matching `User-agent`, else `*`; merge duplicates |
| Rule precedence   | longest (most octets) match wins; tie → `allow` wins (§2.2.2)   |
| Wildcards         | `*` any sequence, `$` end anchor (§2.2.3)                       |
| Percent-encoding  | compare octets; encoded and unencoded forms are equivalent      |
| Case              | paths case-sensitive; user-agents case-insensitive              |
| Empty `Disallow:` | allows everything (valid, not a finding)                        |

## 4. Rule catalog

Ids are indicative (pre-1.0; Phase C may reshape them). Every rule carries
`rigor` + `sources` per the rule-catalog descriptor; severities use the
existing two levels (`error` / `warning`).

### 4.1 robots.txt — file-level rules

| Rule id                       | Kind    | Rigor         | Severity | Judgment                                                                                                                                                                             |
| ----------------------------- | ------- | ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `robotstxt.unreachable`       | boolean | spec-required | error    | 5xx / network failure: RFC 9309 §2.3.1.4 says crawlers MUST assume **complete disallow**. A 404 is fine (allow all).                                                                 |
| `robotstxt.oversized`         | boolean | spec-required | error    | > 500 KiB: parsers only guarantee the first 500 KiB (§2.4); rules past the limit silently do not exist.                                                                              |
| `robotstxt.invalid-line`      | boolean | spec-required | warning  | Lines that parse as nothing (typos like `Disalow:`, rules before any `User-agent:` group). Reported with line №.                                                                     |
| `robotstxt.unknown-directive` | boolean | guideline     | warning  | Recognisable non-standard directives (`Crawl-delay`, `Host`): tolerated by parsers, ignored by Google — say so.                                                                      |
| `robotstxt.cross-origin`      | boolean | vendor-spec   | warning  | `/robots.txt` redirects to another origin: legal to follow (§2.3.1.2) but fragile and usually a proxy accident.                                                                      |
| `robots.blocks-site`          | —       | vendor-spec   | error    | **Exists today.** Re-expressed on the new descriptor with real sources (RFC 9309 + Google robots intro).                                                                             |
| `robots.blocks-page`          | boolean | vendor-spec   | error    | **New, needs §3.3.** A crawled page declares `<meta name="robots" content="index">` but a robots rule disallows its path — the generalisation of `blocks-site` beyond `Disallow: /`. |

### 4.2 robots.txt — `Sitemap:` declarations

| Rule id                         | Kind    | Rigor         | Severity | Judgment                                                                                                                                                |
| ------------------------------- | ------- | ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `robotstxt.sitemap.relative`    | boolean | spec-required | error    | `Sitemap:` value must be an absolute URL (sitemaps.org; RFC 9309 §2.2.4 takes a URI).                                                                   |
| `robotstxt.sitemap.unreachable` | boolean | guideline     | error    | A declared sitemap that 404s is worse than none: it is the authoritative pointer, and it lies.                                                          |
| `robotstxt.sitemap.undeclared`  | boolean | guideline     | warning  | A sitemap exists at a well-known path but robots.txt does not declare it — discoverability gap (matters for non-Google crawlers that only read robots). |

### 4.3 sitemap — structure

| Rule id                     | Kind    | Rigor         | Severity | Judgment                                                                                                                                           |
| --------------------------- | ------- | ------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sitemap.missing`           | boolean | guideline     | warning  | No sitemap anywhere. Google's own guidance: usually worth having; small fully-linked sites genuinely may not need one — hence warning, not error.  |
| `sitemap.unparsable`        | boolean | spec-required | error    | Located but not a well-formed `<urlset>`/`<sitemapindex>` (HTML error page served as XML is the common case).                                      |
| `sitemap.empty`             | boolean | guideline     | warning  | Parses but lists nothing while the crawl found pages. Today this silently falls back to crawling; it becomes a finding **and** keeps the fallback. |
| `sitemap.limits.exceeded`   | boolean | spec-required | error    | > 50,000 URLs or > 50 MB uncompressed per document (sitemaps.org). Entries past the limit are dead weight the consumer may drop.                   |
| `sitemap.index.child-error` | boolean | spec-required | error    | Index references a child that is unreachable or unparsable — a hole in the declared inventory.                                                     |
| `sitemap.index.nested`      | boolean | vendor-spec   | error    | An index references another index. Google does not support nesting; the subtree is invisible.                                                      |

### 4.4 sitemap — entries

| Rule id                           | Kind    | Rigor         | Severity | Judgment                                                                                                                                                                                           |
| --------------------------------- | ------- | ------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sitemap.entry.invalid-url`       | boolean | spec-required | error    | `<loc>` not an absolute, parseable, entity-escaped URL.                                                                                                                                            |
| `sitemap.entry.out-of-scope`      | boolean | spec-required | error    | sitemaps.org location semantics: a sitemap at `/a/sitemap.xml` may only list URLs under `/a/`; consumers may drop the rest. Covers cross-**path**; root-level sitemaps are exempt by construction. |
| `sitemap.entry.cross-host`        | boolean | spec-required | error    | `<loc>` on a different host (www vs apex included) — unless that host's robots.txt declares this sitemap (the cross-submit escape hatch). Absorbs the never-wired `mixedHost` diagnostic.          |
| `sitemap.entry.protocol-mismatch` | boolean | spec-required | warning  | http entries in an https sitemap (or mixed). Absorbs `mixedProtocol`.                                                                                                                              |
| `sitemap.lastmod.invalid`         | boolean | spec-required | warning  | Not W3C Datetime. Future-dated values are flagged by the same rule (`observed` says which).                                                                                                        |
| `sitemap.field.invalid`           | boolean | spec-required | warning  | `changefreq` outside its enum / `priority` outside 0.0–1.0. The message notes Google ignores both fields either way — fix or delete, don't trust.                                                  |

### 4.5 Cross-artefact — where the two files meet the crawl

These are the expensive ones, and they are all judgments nothing makes today.

| Rule id                           | Kind    | Rigor       | Severity | Judgment                                                                                                                                                                                                          |
| --------------------------------- | ------- | ----------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sitemap.entry.blocked-by-robots` | boolean | vendor-spec | error    | Sitemap says "index this", robots says "never fetch it". Needs the §3.3 matcher. Absorbs the never-wired `robotsConflicts`.                                                                                       |
| `sitemap.entry.unreachable`       | boolean | vendor-spec | error    | A listed URL answers 404/5xx. Probed through the existing link engine (global dedupe — a URL already crawled or link-checked is not re-fetched); bounded by the same caps as the link audit. Absorbs `reachable`. |
| `sitemap.entry.redirects`         | boolean | guideline   | warning  | A listed URL redirects. Google asks for final URLs; every hop is crawl budget and ambiguity.                                                                                                                      |
| `sitemap.entry.noindex`           | boolean | vendor-spec | warning  | A listed URL declares `noindex` (meta or `X-Robots-Tag`). "Please index" and "do not index" cannot both hold. Only evaluable for crawled pages.                                                                   |
| `sitemap.entry.non-canonical`     | boolean | vendor-spec | warning  | A listed URL's canonical points at a different URL: the sitemap should list canonicals. Only evaluable for crawled pages.                                                                                         |
| `sitemap.orphans`                 | boolean | guideline   | warning  | Crawled, indexable pages absent from the sitemap. One finding with a count + sample, not one per page (summary-shaped, like translation holes). Absorbs `orphanCount`.                                            |

`hreflang.sitemap-mismatch` (exists today) stays in the i18n family but is
re-expressed to read `SitemapExtraction` instead of `SiteDiscovery`.

### 4.6 Deliberately not checked

- **Sitemap ping endpoints** — deprecated by Google (June 2023), gone.
- **`Crawl-delay` values** — flagged as unknown-directive, semantics not
  modelled.
- **Per-bot groups** (`User-agent: Googlebot` vs `*`) — rules evaluate the
  effective policy for `*` plus any group that matches goflag's own UA;
  simulating specific vendors' bots is out of scope.
- **`<lastmod>` truthfulness** — whether the date matches actual content
  change is unknowable from outside; only the format is judged.

## 5. Sources to add to the catalog (Phase A seed)

The rule-catalog §4 tables already list RFC 9309, the sitemaps.org protocol,
Google's robots intro and sitemap overview. This plan additionally needs:

| Source                                   | Publisher | Rigor       | Governs                                      | Link                                                                                |
| ---------------------------------------- | --------- | ----------- | -------------------------------------------- | ----------------------------------------------------------------------------------- |
| How Google interprets robots.txt         | Google    | vendor-spec | group merging, 500 KiB limit, error handling | https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt       |
| Manage sitemaps / sitemap index (Google) | Google    | vendor-spec | index nesting, size limits in practice       | https://developers.google.com/search/docs/crawling-indexing/sitemaps/large-sitemaps |
| W3C Datetime note                        | W3C       | normative   | `<lastmod>` format                           | https://www.w3.org/TR/NOTE-datetime                                                 |

License note: sitemaps.org is **CC BY-SA 2.5** (share-alike — link + paraphrase,
no adapted redistribution under our license); RFC 9309 under **BCP 78** (quote
and paraphrase fine, no modified spec text). Same posture as rule-catalog §4.1.1.

## 6. Report surface

- Findings land in `siteIssues` with the standard shape — same fingerprinting,
  baseline, `--regressions-only`, `--max-debt` mechanics for free. `pageUrl`
  is the artefact URL (the robots.txt or sitemap document) except for
  entry-level rules, where it is the entry's `<loc>` so the finding names the
  page a human must fix.
- Entry-level rules on large sitemaps summarize: one finding per rule with a
  count and a sample of locs (the `--summary` lesson: 40 repeats of one defect
  is noise).
- `diagnostics.sitemap` keeps its shape (found / urlCount / uncrawled), and
  the dead `SitemapDiagnostics` analysis fields are **deleted** — every one of
  them is absorbed by a rule above, which is where they should have lived.

## 7. Phasing

Scheduled as **Phase G** of the rule-catalog plan. Dependencies: **A**
(sources), **B** (extraction — extended to site level here), **C** (rule
descriptor). Independent of D (profiles), E (prose), F (wiring) — though F
must thread `siteIssues` the same way it threads page findings.

| Step    | Deliverable                                                                                                                |
| ------- | -------------------------------------------------------------------------------------------------------------------------- |
| **G.1** | `RobotsExtraction`: full RFC 9309 parse with line provenance; replaces `RobotsProbe`; the §3.3 matcher with its test suite |
| **G.2** | robots rules (§4.1–4.2), including re-expressing `robots.blocks-site` and shipping `robots.blocks-page`                    |
| **G.3** | `SitemapExtraction`: document tree kept, `SiteDiscovery` consumes it; structure + entry rules (§4.3–4.4)                   |
| **G.4** | Cross-artefact rules (§4.5), bounded probing through the link engine; delete the dead diagnostics fields                   |

Each step ships independently (tests + full gate → MR to `develop`), G.1 → G.4
in order — the matcher is the only real prerequisite chain.

**Exit criteria**

- The four fixture sites produce zero false positives on these rules
  (dogfood-first, the phase-1 method).
- A sitemap index with one broken child, one nested index, and one blocked
  entry produces exactly three findings, each citing its source.
- `goflag rules --json` lists every rule above with `rigor` and ≥1 source.

## 8. Open decisions

| Question                                                                       | Default until decided                                                                   |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Does `sitemap.missing` fire on tiny sites (≤ crawl-found N pages)?             | Fires always; it is a warning, and `--ignore` mechanics exist for the rest              |
| Probe budget for `sitemap.entry.unreachable` on 50k-entry sitemaps             | Reuse link-audit caps; sample beyond the cap and say so (a capped count lies otherwise) |
| Id prefix: `robotstxt.*` for the file vs today's `robots.*` (page-meta) family | Keep both prefixes — the artefact and the meta tag are different subjects               |
| Should the crawler itself start respecting robots rules it now fully parses?   | Separate decision, not part of this plan (auditors get to look everywhere)              |
