/**
 * Per-suggestion contract harness.
 *
 * For every template:
 *
 *   1. Feed it a "triggering" `Page` and assert the engine surfaces the
 *      suggestion (when run end-to-end via `suggest()`).
 *   2. Feed it a "non-triggering" `Page` (or a page that already
 *      declares the equivalent JSON-LD type) and assert the
 *      suggestion is suppressed.
 *   3. Parse the rendered snippet, validate it through
 *      `validateJsonLdBlock`, and assert it produces zero
 *      `error`-severity findings.
 *
 * The third step is the Phase 6 "DoD: Every suggestion template's
 * generated output validates against schema.org" check encoded as a
 * test, so the suggestions and the validator can never silently drift
 * apart.
 */

import { describe, expect, it } from "vitest";

import { suggest } from "@/lib/suggestions";
import type { SuggestionId } from "@/lib/structured/types";
import { validateJsonLdBlock } from "@/lib/structured/validate";
import { extractTypes } from "@/lib/core/extract/json-ld";
import { pageFromHtml } from "@/lib/rules/test-utils";

interface Case {
  id: SuggestionId;
  trigger: { html: string; url: string };
  suppress: { html: string; url: string };
}

const HOMEPAGE_HTML = `<html><head>
  <meta property="og:site_name" content="Acme Corp">
  <title>Acme — Home</title>
</head><body><h1>Acme</h1></body></html>`;

const HOMEPAGE_WITH_ORG = `<html><head>
  <meta property="og:site_name" content="Acme Corp">
  <title>Acme</title>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme","url":"https://acme.com/"}</script>
</head><body></body></html>`;

const ARTICLE_HTML = `<html><head>
  <meta property="og:type" content="article">
  <meta property="og:title" content="Why latency matters">
  <meta property="og:image" content="https://blog.example.com/cover.jpg">
  <meta property="og:url" content="https://blog.example.com/why-latency-matters">
  <meta name="author" content="Jane Engineer">
  <link rel="canonical" href="https://blog.example.com/why-latency-matters">
  <title>Why latency matters — Acme blog</title>
</head><body><article></article></body></html>`;

const ARTICLE_WITH_BREADCRUMB = `<html><head>
  <meta property="og:type" content="article">
  <link rel="canonical" href="https://blog.example.com/why-latency-matters">
  <title>Why latency matters</title>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"https://blog.example.com/"}]}</script>
</head><body></body></html>`;

const ARTICLE_WITH_ARTICLE_JSONLD = `<html><head>
  <meta property="og:type" content="article">
  <link rel="canonical" href="https://blog.example.com/why-latency-matters">
  <title>Why latency matters</title>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"Why latency matters","author":{"@type":"Person","name":"Jane"},"datePublished":"2026-01-01"}</script>
</head><body></body></html>`;

const PROFILE_HTML = `<html><head>
  <meta property="og:type" content="profile">
  <meta name="author" content="Jane Engineer">
  <title>Jane Engineer</title>
</head><body></body></html>`;

const PROFILE_WITH_PERSON = `${PROFILE_HTML.replace("</head>", `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Person","name":"Jane"}</script></head>`)}`;

const FAQ_HTML = `<html><head><title>FAQ</title></head><body></body></html>`;
const FAQ_WITH_FAQPAGE = `<html><head><title>FAQ</title><script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Q","acceptedAnswer":{"@type":"Answer","text":"A"}}]}</script></head><body></body></html>`;

const APP_HTML = `<html><head>
  <meta property="og:type" content="product">
  <title>Acme — your new note app</title>
</head><body></body></html>`;
const APP_WITH_SOFTWARE = `${APP_HTML.replace("</head>", `<script type="application/ld+json">{"@context":"https://schema.org","@type":"SoftwareApplication","name":"Acme","applicationCategory":"WebApplication","operatingSystem":"Web"}</script></head>`)}`;

const CASES: Case[] = [
  {
    id: "Organization",
    trigger: { html: HOMEPAGE_HTML, url: "https://acme.com/" },
    suppress: { html: HOMEPAGE_WITH_ORG, url: "https://acme.com/" },
  },
  {
    id: "WebSite",
    trigger: { html: HOMEPAGE_HTML, url: "https://acme.com/" },
    suppress: {
      html: HOMEPAGE_HTML.replace(
        "</head>",
        `<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Acme","url":"https://acme.com/"}</script></head>`,
      ),
      url: "https://acme.com/",
    },
  },
  {
    id: "Article",
    trigger: { html: ARTICLE_HTML, url: "https://blog.example.com/why-latency-matters" },
    suppress: {
      html: ARTICLE_WITH_ARTICLE_JSONLD,
      url: "https://blog.example.com/why-latency-matters",
    },
  },
  {
    id: "BreadcrumbList",
    trigger: { html: ARTICLE_HTML, url: "https://blog.example.com/why-latency-matters" },
    suppress: {
      html: ARTICLE_WITH_BREADCRUMB,
      url: "https://blog.example.com/why-latency-matters",
    },
  },
  {
    id: "Person",
    trigger: { html: PROFILE_HTML, url: "https://acme.com/about" },
    suppress: { html: PROFILE_WITH_PERSON, url: "https://acme.com/about" },
  },
  {
    id: "FAQPage",
    trigger: { html: FAQ_HTML, url: "https://acme.com/faq" },
    suppress: { html: FAQ_WITH_FAQPAGE, url: "https://acme.com/faq" },
  },
  {
    id: "SoftwareApplication",
    trigger: { html: APP_HTML, url: "https://acme.com/p/notes" },
    suppress: { html: APP_WITH_SOFTWARE, url: "https://acme.com/p/notes" },
  },
];

describe("suggestion contract", () => {
  for (const c of CASES) {
    describe(c.id, () => {
      it("appears on the triggering page", () => {
        const page = pageFromHtml(c.trigger.html, { url: c.trigger.url });
        const ids = suggest(page).map((s) => s.id);
        expect(ids).toContain(c.id);
      });

      it("is suppressed when the page already declares that JSON-LD type", () => {
        const page = pageFromHtml(c.suppress.html, { url: c.suppress.url });
        const ids = suggest(page).map((s) => s.id);
        expect(ids).not.toContain(c.id);
      });

      it("emits JSON-LD that round-trips through the validator with zero errors", () => {
        const page = pageFromHtml(c.trigger.html, { url: c.trigger.url });
        const suggestion = suggest(page).find((s) => s.id === c.id);
        expect(suggestion, `${c.id} suggestion missing`).toBeDefined();
        if (!suggestion) return;
        const parsed = JSON.parse(suggestion.example.snippet);
        const issues = validateJsonLdBlock({
          index: 0,
          raw: suggestion.example.snippet,
          data: parsed,
          types: extractTypes(parsed),
        });
        const errors = issues.filter((i) => i.severity === "error");
        expect(errors, `${c.id} produced validation errors: ${JSON.stringify(errors)}`).toEqual([]);
      });
    });
  }
});
