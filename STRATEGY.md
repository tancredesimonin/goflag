---
updated: 2026-08-16
---

# Strategy — goflag

## In one sentence

A CLI that audits a site for broken links, missing translation pages, a robots.txt that contradicts your pages, and missing or misconfigured SEO metadata — and a Next.js library that produces the HTML it would have nothing to say about.

## The problem

What costs the most in search fits in a few bytes of `<head>`, of `robots.txt` and of the
sitemap, per page, across hundreds of pages. Nothing breaks, the page renders normally, and it drops
out of the index — so nothing triggers the review that would have caught it.

The tools that look for these mistakes hand down a verdict without saying who requires it:
there is no way to tell a specification requirement from a belief copied from blog to blog, so
no way to know what to fix first. And none of them says anything about half the problem — a
multilingual site whose translations are declared in the sitemap, in the `<head>`, and not in
the same terms.

The other half is upstream: a sitemap derived separately from the metadata is two derivations
of one intention, held in agreement by vigilance. An auditor that reports their disagreement
is treating the symptom.

## Who it serves

| User                                       | What they get                                                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| A developer publishing a multilingual site | `npx @goflag/cli <url>`: a JSON report, an exit code, and a ratchet (`--baseline` + `--max-debt`) that brings the debt down |
| The author's Next.js sites                 | the ground the rules are extracted from, and the first audience for the CI gate                                             |
| `apps/website` (goflag.tech)               | first consumer of `@goflag/next`, and audited by the CLI it documents (`pnpm --filter @goflag/website seo`)                 |
| An agent, or a CI                          | `goflag rules` and `goflag flags` export the catalogue and the option table: data, not a page to read                       |

## Goals

1. Make executable what a human cannot check at scale: broken links, translation holes,
   robots/sitemap/`<head>` contradictions, metadata that is absent or wrong.
2. Never hand down a verdict without saying who requires it: every rule carries its `rigor`
   and cites its sources, or declares that it cannot and asks the question instead.
3. Stay usable on a site that already has a backlog: the gate measures regression, never
   perfection, and refuses to show green while findings remain.
4. Remove upstream what the auditor reports downstream: `@goflag/next` projects metadata,
   hreflang cluster, sitemap and robots from a single route registry.
5. Stay two separable products: each must be worth having on its own (I1, I2, I3).

## How we would know it works

- **What is measured today**: 709 unit tests on `@goflag/cli` and 116 on `@goflag/next`
  (`pnpm --filter … test:unit`), plus the integration suites; the published catalogue
  (`rules.json`, `flags.json`) is compared byte for byte against what the engine runs, so the
  documentation can no longer describe a rule that is gone.
- **The closest product signal**: goflag.tech audits itself with the CLI it documents. A
  documentation site that does not pass its own tool is the only rebuttal that counts.
- **What is not measured**: no usage measurement in place. No npm downloads, no count of
  third-party repositories, no adoption by sites outside this group. Writing a number here
  would be inventing it.

## Business model

_Not applicable — MIT, published for free on npm, extracted from the work done on the author's
sites._ The cost is time, not money, and the only obligation created is the one npm creates: a
published version is a promise kept, hence the deliberate `0.x` stance and an API declared
unstable.

## What this repo will not do

- No dashboard, no config system, no social-preview gallery. The JSON report is the product;
  the terminal is only a render of it.
- No verdict on what a linter cannot decide. A title that "describes" the page stays a
  question asked with its evidence (`--advisories`), never a finding.
- No merging of the site repositories, and no wrapper around `next-intl`.
- No `@goflag/spec` package before two real consumers (I4).
- No coverage outside the Next.js App Router for the library (I5) — the CLI itself stays
  framework-agnostic.

## What is still open

- Extract the spec into `@goflag/spec`, or leave it in the CLI: settled when the library's
  tests import it.
- The public GitHub mirror does not exist; `homepage`, `repository` and `bugs` in both npm
  manifests already point at `github.com/tancredesimonin/goflag`, while the repository lives
  on GitLab.
- The shape of a multilingual `llms.txt` is not settled anywhere public, and the space is
  moving (native support under discussion at Next.js).
- The `.goflag/routes.json` manifest — comparing the intention the library declares against
  what the CLI observes — is still to be designed.
