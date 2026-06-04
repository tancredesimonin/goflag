# Headlint Suite — Technical Spec

> **Status:** Draft / proposal.
> **Scope:** Turn Headlint from a single `<head>` inspector into a **three-lens local site auditor** that shares one discovery pipeline. Enter a base URL **once** → get a Sitemap audit, a Head audit, and a Link audit. Everything runs locally, no account, no telemetry.

---

## 1. Product vision

One input. Three audits. Same site, three different questions:

| Feature                        | Question it answers                                                        | Unit of analysis                   | Process shape                                            |
| ------------------------------ | -------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------- |
| **Sitemap Checker & Analysis** | _"Can search engines discover every page, and is the map itself healthy?"_ | The sitemap document + its entries | Fetch + parse the map, ping its entries                  |
| **Head Checker** _(existing)_  | _"Does each page present itself correctly in search & social?"_            | One page's `<head>`                | Render + lint per page against the ruleset               |
| **Link Checker** _(new)_       | _"Do all the links on the site actually resolve?"_                         | The cross-page link graph          | Scrape every page's links, probe each unique target once |

They are **related but distinct processes** — close, not the same:

- All three start from one **shared discovery pass** (`discoverSitemap`).
- Each then runs its **own engine** over the discovered page set.
- The user enters the base URL **once**; the app fans out.

```
                       ┌──────────────────────────────┐
   base URL  ────────► │  discoverSitemap(baseUrl)      │  (shared, runs once)
                       │  → SiteDiscovery (page list)   │
                       └───────────────┬────────────────┘
                                       │
            ┌──────────────────────────┼───────────────────────────┐
            ▼                          ▼                            ▼
   ┌─────────────────┐      ┌────────────────────┐       ┌────────────────────┐
   │ Sitemap engine  │      │  Head engine        │       │  Link engine        │
   │ (analysis +     │      │  inspect() + rules  │       │  scrape + probe     │
   │  entry health)  │      │  per page           │       │  every link once    │
   └────────┬────────┘      └─────────┬───────────┘       └─────────┬──────────┘
            ▼                         ▼                             ▼
      /site (route)             /inspect (route)               /links (route)
```

---

## 2. Architectural principles (inherited, non-negotiable)

These come straight from `PLAN.md` and apply to every new module:

1. **Engine ↔ UI separation.** Everything under `src/lib/core/**` must be plain, JSON-serializable, and free of `next` / `react` / DOM / browser globals so it can ship as `@headlint/core`. The new link engine follows the same rule as `sitemap/` and `crawl.ts`.
2. **Never throw across an engine boundary.** Mirror `discoverSitemap` / `crawl`: every failure collapses into a shaped result with diagnostics. A single dead link or 500 must never abort an audit.
3. **No telemetry.** No outbound calls except to the site under audit (and the external hosts its links point to).
4. **Caps everywhere.** Every crawl/scan/probe loop is bounded (`maxPages`, `maxLinks`, `maxPerHost`, timeouts) so a misconfigured run can't hang or hammer.
5. **Tested through the real fetch path.** Engine tests hit the Hono fixture server (mocks forbidden in engine tests, per `PLAN.md` testing standards).

---

## 3. Shared layer

### 3.1 Discovery (already built — reuse as-is)

`src/lib/core/sitemap/discover.ts` → `discoverSitemap(baseUrl, options)` already does exactly what all three features need for "get every page":

- robots.txt → well-known paths → BFS crawl fallback (`crawl.ts`).
- Follows `<sitemapindex>` children, inflates gzip, dedupes, caps at `maxUrls`.
- Returns `SiteDiscovery { origin, baseUrl, source, urls, diagnostics, truncated }`.

This is the single source of the page list. **No change to its contract**; we only _add consumers_.

### 3.2 New shared primitive: `fetchUrl`

The link engine and the strengthened sitemap engine both need a low-level "fetch a URL and tell me its status / final URL / body" helper that is politer and more general than the private `fetchDoc` inside `discover.ts`. Extract a shared primitive:

`src/lib/core/net/fetch-url.ts`

```ts
export interface FetchUrlOptions {
  signal?: AbortSignal;
  timeoutMs?: number; // default 8_000
  method?: "GET" | "HEAD"; // default GET
  allowInsecureTls?: boolean;
  userAgent?: string; // default a real browser UA (avoid bot 403s)
  redirect?: "follow" | "manual"; // default "follow"
  maxBytes?: number; // body cap for HTML scans (e.g. 3 MB)
}

export interface FetchUrlResult {
  requestedUrl: string;
  finalUrl: string; // after redirects
  status: number; // 0 on network error
  redirected: boolean;
  redirectChain: string[]; // [] unless redirect: "manual"
  contentType?: string;
  body?: string; // omitted for HEAD / non-text / over maxBytes
  reason?: FetchFailureReason; // "timeout" | "dns" | "tls" | "abort" | "network"
  durationMs: number;
}
```

- Built on `combineSignals` from `src/lib/core/probes/abort.ts` (timeout + caller cancel) and the `relaxTlsIfRequested` pattern already in `discover.ts`.
- Sends a **real browser User-Agent** by default — critical to avoid false-positive 403s from bot detection.
- `discoverSitemap`'s internal `fetchDoc` can be refactored to sit on top of this later (optional; not required for v1 of the suite).

### 3.3 Per-origin stores (mirror the existing pattern)

`src/lib/store/site-store.ts` already caches `SiteDiscovery` per origin (LRU, `MAX_ORIGINS = 20`). Add two siblings with the identical shape:

- `src/lib/store/link-audit-store.ts` → caches `LinkAuditReport` per origin.
- (Head already has `inspect-cache.ts`.)

All three stores keyed by **origin** so any page URL resolves to the same site-wide result. These remain the "backend seam" for a future hosted layer.

---

## 4. Feature A — Sitemap Checker & Analysis (consolidate + strengthen)

### 4.1 What exists today

- Engine: `discoverSitemap` + `SitemapDiagnostics` (in `sitemap/types.ts`).
- UI: `SitemapAnalysis` card (`src/components/site/sitemap-analysis.tsx`) on the `/site` route, plus `site-url-list.tsx`.

It answers: robots reachable? sitemap found? declared in robots? well-formed? how many URLs? index? child errors?

### 4.2 Consolidation goal

Promote sitemap analysis from "a card on the site page" to a **standalone, strengthened audit feature** that owns the `/site` route, with the URL list as a secondary panel. Keep the existing `SitemapAnalysis` component as the summary header; add deeper checks below it.

### 4.3 New checks (strengthen `SitemapDiagnostics`)

Add the following signals. Cheap ones compute during discovery; the reachability check reuses the link engine's `checkLink` primitive (§6.4) so we don't duplicate fetch logic.

| Check                                | Signal                                      | How                                                               |
| ------------------------------------ | ------------------------------------------- | ----------------------------------------------------------------- |
| **Entry reachability**               | % of `<loc>` URLs returning 200             | Probe each entry via `checkLink` (same dedupe/concurrency engine) |
| **Orphan pages**                     | URLs found by crawl but absent from sitemap | Diff `crawl` visited set vs sitemap `urls`                        |
| **Ghost entries**                    | Sitemap URLs that 404 / redirect            | Falls out of entry reachability                                   |
| **`lastmod` hygiene**                | missing / malformed / future-dated          | Parse `SitemapUrlEntry.lastmod`                                   |
| **Canonical / trailing-slash drift** | entry URL ≠ page's canonical                | Compare against Head engine's canonical when available            |
| **Protocol & host consistency**      | http vs https, www vs apex mix              | Normalize and group entry origins                                 |
| **Size & count limits**              | > 50k URLs or > 50 MB per file              | Already partly tracked via caps; surface explicitly               |
| **robots conflicts**                 | sitemap entry disallowed by robots.txt      | Cross-check against parsed robots rules                           |

Proposed additions to `SitemapDiagnostics` (extend, don't break — all optional):

```ts
export interface SitemapDiagnostics {
  // ...existing fields...
  reachable?: { checked: number; ok: number; broken: number; redirected: number };
  orphanCount?: number; // crawl-found, not in sitemap
  lastmodIssues?: number; // missing/malformed/future
  mixedProtocol?: boolean;
  mixedHost?: boolean;
  robotsConflicts?: number;
}
```

### 4.4 Route & UI

- Route: `/site` (unchanged path; upgraded content).
- Layout: `SitemapAnalysis` summary (existing) → **Health checklist** (new checks) → **Entry table** (`site-url-list`, now annotated with per-entry status badges from the reachability probe) → **Orphans panel** → **Warnings**.

---

## 5. Feature B — Head Checker (existing — keep + integrate)

The original Headlint engine: inspect each page's `<head>` and lint it against the built-in ruleset, with rendered preview cards. Already shipped; this section specs how it fits the consolidated suite and the small changes the unified flow needs.

### 5.1 What exists today

- Engine: `inspect(url, options)` (`src/lib/core/inspect.ts`) → `Page` (`src/lib/core/types.ts`) with parsed `meta` / `openGraph` / `twitter` / structured data, plus `html.static` and optional headless `html.rendered`.
- Crawl: `crawl()` (`src/lib/core/crawl.ts`) fans `inspect` across a site (BFS, same-origin, concurrency-capped).
- Rules & suggestions: `src/lib/rules/**`, `src/lib/suggestions/**` → `Issue[]` (error/warning/info) + ready-to-paste fixes.
- UI: `/inspect` route + preview cards (`src/lib/previews/**`), Issues / Raw / Structured-data / i18n / Assets tabs.
- Cache: `inspect-cache.ts` (per-URL).

### 5.2 What it answers

Per page: is the title/description present and well-sized? OG/Twitter/Discord/Slack/iMessage cards correct? JSON-LD valid? hreflang/robots/canonical/favicons/manifest sound? — rendered exactly as users see it in search & social.

### 5.3 Integration changes for the suite

The engine is unchanged; only the **entry path** is unified:

- **Consume the shared discovery.** Today `/inspect` inspects on demand and the sidebar merges `site-store` URLs with `inspect-cache` (`buildSidebarItems`). In the suite, the head audit draws its page list from the same `SiteDiscovery` produced by the single base-URL entry — no second URL prompt.
- **Optional batch warm.** `runFullAudit` may warm the head cache by running `crawl()` (or lazily inspecting on navigation) so the dashboard can show a site-wide issue count, not just per-page-on-click. Lazy-by-default to avoid headless cost; "Audit all pages" is an explicit action.
- **Cross-feature reuse.** The head engine's parsed canonical feeds the sitemap engine's canonical/trailing-slash drift check (§4.3). No new engine module required.

### 5.4 Route & UI — `/inspect`

Unchanged in structure (Previews / Issues / Raw / Structured data / i18n / Assets). Additions: a site-wide issue summary on the dashboard, and the shared sidebar gains link-health badges (§6) alongside the existing inspect status.

---

## 6. Feature C — Link Checker (new)

The headline new feature. Goal: **find broken links** (internal and external) across the whole site.

### 6.1 Module layout

```
src/lib/core/links/
  types.ts        # LinkRef, LinkCheck, LinkAuditReport, verdicts
  extract.ts      # extractLinks(html, baseUrl) -> LinkRef[]  (cheerio)
  check.ts        # checkLink(url, opts) -> LinkCheck         (HEAD→GET, retry)
  audit.ts        # runLinkAudit(discovery, opts) -> LinkAuditReport (orchestrator)
  classify.ts     # status + reason -> LinkVerdict
  *.test.ts
```

### 6.2 Link extraction — `extract.ts`

Unlike `extractCandidateLinks` in `src/lib/core/discover.ts` (which is crawl-scoped: same-origin only, regex, `href` only), the link checker needs **all** links with metadata for reporting. Use **cheerio** (already a dependency) for accurate parsing.

```ts
export type LinkKind = "internal" | "external";
export type LinkSource = "a" | "img" | "script" | "link" | "iframe";

export interface LinkRef {
  rawHref: string; // as authored
  url: string; // canonical absolute (canonicaliseUrl)
  kind: LinkKind; // relative to the audited origin
  source: LinkSource; // which element it came from
  rel: string[]; // ["nofollow","sponsored",...] for <a>
  anchorText?: string; // trimmed text for <a>
  fragment?: string; // "#section" if present
}
```

Extraction rules:

- **Default scope:** `<a href>` only (matches the user's "all links" intent).
- **Optional (config toggle) asset scope:** `<img src>`, `<script src>`, `<link href>`, `<iframe src>` — catches broken images/assets too.
- Resolve every URL against the page's **final URL** (post-redirect), then `canonicaliseUrl` (reuse from `crawl.ts`: strips fragment, normalizes trailing slash, rejects `mailto:`/`tel:`/`javascript:`).
- Classify `internal` vs `external` by comparing origin to the audited origin.
- Preserve the **fragment separately** so we can optionally verify in-page anchors without breaking dedupe.

### 6.3 Per-URL check — `check.ts`

The make-or-break of a credible link checker is **avoiding false positives**. Logic:

1. **Skip** non-checkable schemes (`mailto:`, `tel:`, `data:`, `javascript:`) → verdict `skipped`.
2. Try `HEAD` first (cheap). If `405`/`501`/`403` or no useful status → retry with `GET` (many servers reject HEAD).
3. **Redirects:** follow up to N hops; record the chain. `3xx` that resolves to `2xx` = `redirect` (a _signal_, not breakage). A redirect **loop** or chain ending in `4xx/5xx` = `broken`.
4. **Soft-404 heuristic:** `200` but final URL is the site root / a known error path, or body length below a threshold with "not found" text → verdict `warning` (flag, don't hard-fail).
5. **Bot blocking:** `403`/`429` from external hosts → verdict `blocked` (likely anti-bot, _not_ a real break). Reported separately so users can triage.
6. **Retry/backoff:** 1 retry on `429`, `5xx`, and network errors with short jittered backoff. Respect `Retry-After` when present.
7. **Network failures** (`reason: dns|timeout|tls|network`) → `broken` with the reason attached.

```ts
export type LinkVerdict =
  | "ok" // 2xx
  | "redirect" // 3xx resolving to 2xx
  | "broken" // 4xx/5xx/network
  | "blocked" // 403/429 — probably anti-bot, triage manually
  | "warning" // soft-404 / suspicious
  | "skipped"; // non-http scheme

export interface LinkCheck {
  url: string;
  finalUrl: string;
  status: number; // 0 = network error
  verdict: LinkVerdict;
  method: "HEAD" | "GET";
  redirectChain: string[];
  reason?: string; // "timeout", "dns", "429 rate-limited", ...
  checkedAt: string; // ISO
  durationMs: number;
}
```

### 6.4 Orchestration — `audit.ts`

```ts
export interface LinkAuditOptions {
  signal?: AbortSignal;
  scanConcurrency?: number; // page HTML fetches; default 4
  checkConcurrency?: number; // global link probes; default 8
  maxPerHost?: number; // per-host link probes; default 3 (politeness)
  timeoutMs?: number; // default 8_000
  maxPages?: number; // default 500
  maxLinks?: number; // unique URLs cap; default 10_000
  includeAssets?: boolean; // <img>/<script>/<link>/<iframe>; default false
  checkExternal?: boolean; // default true
  verifyFragments?: boolean; // check #anchors exist; default false
  allowInsecureTls?: boolean;
  onProgress?: (p: AuditProgress) => void;
}

export interface LinkAuditReport {
  origin: string;
  baseUrl: string;
  pagesScanned: number;
  occurrences: LinkOccurrence[]; // every (pageUrl → LinkRef), for mapping
  checks: Record<string, LinkCheck>; // keyed by canonical URL — checked ONCE
  summary: Record<LinkVerdict, number>;
  brokenByPage: Array<{ pageUrl: string; broken: LinkCheck[] }>; // report view
  truncated: boolean;
  diagnostics: { pagesFailed: number; warnings: string[] };
}

export interface LinkOccurrence {
  pageUrl: string;
  ref: LinkRef;
}
```

**Pipeline:**

1. Take the shared `SiteDiscovery` (already discovered) → list of page URLs.
2. **Scan phase** (concurrency `scanConcurrency`): `fetchUrl` each page (static HTML, capped `maxBytes`), run `extractLinks`. Collect `LinkOccurrence[]`. Page fetch failures → `diagnostics.pagesFailed`, never abort.
3. **Dedupe globally:** build the set of unique canonical target URLs. The footer link on 500 pages is checked **once**.
4. **Check phase** (concurrency `checkConcurrency`, **`maxPerHost` cap so we don't get IP-banned**): `checkLink` each unique URL. Skip external if `checkExternal: false`.
5. **Map back:** join `checks` to `occurrences` → `brokenByPage` for the report.
6. Emit `onProgress` after each phase/wave (for the streaming UI).

> **Why a separate light scan instead of `crawl()`/`inspect()`?**
> `crawl` → `inspect` is head-extraction-heavy and can escalate to headless Chromium. Link checking only needs static HTML. The scan phase is a thin `fetchUrl` + cheerio pass — much cheaper at site scale. (We still reuse `canonicaliseUrl` and the discovery output.)

### 6.5 Route & UI — `/links`

- **Summary header:** counts per verdict (ok / broken / redirect / blocked / warning), pages scanned, unique links checked, truncated flag.
- **Broken-links table** (primary): target URL, status/reason, verdict badge, **list of source pages** (collapsible), method used, redirect chain.
- **Filters:** internal/external, verdict, host.
- **Per-page drill-down:** reuse the shared sidebar (pages already listed from `site-store`); selecting a page shows its outbound links and their health.
- Progress streamed via the `onProgress` callback (scan X/Y pages → check X/Y links).

---

## 7. Unified entry & navigation ("base URL once → checks everything")

### 7.1 Home (`/`)

Single URL input. Submitting runs the **shared discovery** then lands the user on a **dashboard** with three result cards (Sitemap / Head / Links), each linking to its full feature page. Optional checkboxes to choose which audits to run (all on by default).

### 7.2 Server actions

Follow the exact pattern of `src/app/actions/site.ts` (`loadSite`): validate URL, never throw across the boundary, return a structured result, store per-origin.

```ts
// src/app/actions/audit.ts
runFullAudit(input); // discovery + (optionally) kick off link audit + warm head cache
runLinkAudit(input); // discovery (or reuse store) → runLinkAudit → link-audit-store
// existing: loadSite (sitemap), runInspect (head)
```

- `runLinkAudit` resolves the page list from `site-store` if already discovered (so we honor "once"), otherwise discovers first.
- All actions `revalidatePath` their route and return `{ ok, ... } | { ok:false, error }`.

### 7.3 Routes summary

| Route      | Feature                    | Status     |
| ---------- | -------------------------- | ---------- |
| `/`        | Unified entry + dashboard  | upgrade    |
| `/site`    | Sitemap Checker & Analysis | strengthen |
| `/inspect` | Head Checker               | existing   |
| `/links`   | Link Checker               | **new**    |
| `/rules`   | Ruleset reference          | existing   |

The existing `inspect-sidebar` + `buildSidebarItems` (merging `site-store` URLs with `inspect-cache`) already gives cross-feature page navigation; extend its item type to optionally carry a per-page link-health badge from the link-audit store.

---

## 8. Politeness, performance & safety defaults

| Knob                            | Default                                  | Rationale                                     |
| ------------------------------- | ---------------------------------------- | --------------------------------------------- |
| Page scan concurrency           | 4                                        | Matches `crawl` default; gentle on the target |
| Link check concurrency (global) | 8                                        | Throughput                                    |
| Link check per-host             | 3                                        | Avoid IP bans on external hosts               |
| Timeout                         | 8 s                                      | Matches `discover.ts`                         |
| Retries                         | 1 (429/5xx/network, honor `Retry-After`) | Cuts false positives                          |
| `maxPages`                      | 500                                      | Bounded run                                   |
| `maxLinks` (unique)             | 10 000                                   | Bounded run                                   |
| User-Agent                      | real browser UA                          | Avoid bot 403s                                |
| Global dedupe                   | always                                   | Each URL checked once                         |

All knobs surfaced in the UI's "Advanced" panel; all enforced in the engine regardless of UI.

---

## 9. Edge cases the engine must handle (link checker)

1. **Global dedupe** — same link on N pages → one probe, mapped back to all N.
2. **HEAD rejected** → GET fallback.
3. **Redirects** classified as signal, not breakage; loops/`→4xx` = broken.
4. **Soft-404s** → `warning`, never silent.
5. **Anti-bot 403/429** → `blocked`, triaged separately from `broken`.
6. **Fragment links** (`#anchor`) — deduped by base URL; optional anchor-existence verification.
7. **Non-http schemes** (`mailto:`/`tel:`/`data:`/`javascript:`) → `skipped`.
8. **Self-signed TLS** (localhost/tunnels) → `allowInsecureTls` toggle (reuse `relaxTlsIfRequested`).
9. **Cancellation** via `AbortSignal` → `combineSignals`.
10. **Per-page failure isolation** — a 500 page contributes to `pagesFailed`, never aborts the audit.

---

## 10. Testing plan (per `PLAN.md` standards)

**Coverage gates:** `src/lib/core/links/**` and the strengthened `sitemap/**` → ≥ 90% lines/branches (same as existing core).

**Fixture server (Hono, real fetch path — no mocks in engine tests):** extend the fixture app to serve:

- pages with internal + external links,
- a 404 page, a 500 page, a redirect chain, a redirect loop,
- a `HEAD`-rejecting (405) endpoint that answers `GET`,
- a `429` endpoint with `Retry-After`,
- a soft-404 (200 body saying "not found"),
- a self-signed TLS host (for the insecure toggle),
- a sitemap that lists a dead URL (for sitemap entry-reachability + orphan tests).

**Layers:**

- **Unit:** `extractLinks` (rel/anchor/kind/asset toggles), `classify`, `checkLink` (HEAD→GET, retry, redirect, soft-404, blocked), `canonicaliseUrl` reuse.
- **Integration:** `runLinkAudit` end-to-end against the fixture site → assert dedupe count, `brokenByPage`, per-verdict summary, truncation, cancellation.
- **Component:** `/links` table + filters + summary; strengthened sitemap checklist.
- **E2E (Playwright):** boot app + fixture server, enter base URL once, verify all three feature pages populate from a single discovery.

---

## 11. Suggested build phases

1. **Phase L0 — shared `fetchUrl`** primitive (`net/fetch-url.ts`) + tests. Refactor nothing yet.
2. **Phase L1 — link engine core:** `links/{types,extract,check,classify,audit}.ts` + unit/integration against extended fixture server.
3. **Phase L2 — link store + server action** (`link-audit-store.ts`, `actions/audit.ts`).
4. **Phase L3 — `/links` UI** (summary, broken table, filters, progress) + component/E2E.
5. **Phase S1 — sitemap consolidation:** promote `/site`, add strengthened checks (orphans, lastmod, entry reachability via `checkLink`), extend `SitemapDiagnostics`.
6. **Phase U1 — unified entry/dashboard** on `/` + cross-feature sidebar badges.
7. **Phase D0 — docs:** update `README.md` + `PLAN.md` so the positioning covers all three lenses (sitemap, head, links).

Each phase ships green CI with its required test layers before the next starts (per `PLAN.md` "phase complete" addendum).

---

## 12. Naming

Keep **Headlint** as the umbrella product; it now hosts three lenses:

- **Sitemap** — discoverability & map health.
- **Head** — search/social presentation _(the original "Lighthouse for the `<head>`")_.
- **Links** — link-graph integrity.

If a distinct internal label for the link feature helps in the UI/codebase, **"Linkrot"** (the established term for link decay) is the strongest sub-brand; the engine namespace stays the neutral `src/lib/core/links/`.
