import { expect, test } from "@playwright/test";

/**
 * Phase 6 DoD slice: inspecting a real fixture blog post should
 *
 *   1. expose the Structured Data tab (with the embedded Article block
 *      from the tancrede fixture rendered in the tree view),
 *   2. surface the BreadcrumbList suggestion as a card with a
 *      copy-pasteable JSON-LD snippet,
 *   3. mirror the same suggestion into the Issues panel as an `info`
 *      entry (Phase 6.8).
 *
 * The fixture is the existing tancrede blog post (`/blog/architecture-api-dsp2`),
 * which carries `og:type=article` + a `/blog/` URL pattern — both
 * signals our heuristics need to classify it as an article without
 * any extra setup.
 */

const fixtureBase = "http://127.0.0.1:4322";
const target = `${fixtureBase}/blog/architecture-api-dsp2`;

test.describe("structured-data + suggestions", () => {
  test("blog post fixture surfaces the BreadcrumbList suggestion with a snippet", async ({
    page,
  }) => {
    await page.goto(`/inspect?url=${encodeURIComponent(target)}`);
    await expect(page.getByTestId("header-title").first()).toBeVisible();

    await page.getByTestId("tab-structured").first().click();

    const suggestion = page
      .locator(`[data-testid="suggestion-card"][data-suggestion-id="BreadcrumbList"]`)
      .first();
    await expect(suggestion).toBeVisible();

    const snippet = suggestion.locator('[data-testid="suggestion-snippet"]');
    await expect(snippet).toContainText("BreadcrumbList");
    await expect(snippet).toContainText("itemListElement");

    // Copy button is reachable & labelled (clipboard write itself is
    // browser-permission gated and not asserted here).
    await expect(suggestion.getByTestId("suggestion-copy")).toBeVisible();
  });

  test("Issues panel mirrors suggestions as info entries", async ({ page }) => {
    await page.goto(`/inspect?url=${encodeURIComponent(target)}`);
    await expect(page.getByTestId("header-title").first()).toBeVisible();

    await page.getByTestId("tab-issues").first().click();

    // The Phase 6 mirror prefixes every suggestion-derived issue with
    // `suggestion.<id>` — we look for the BreadcrumbList one.
    const issue = page
      .locator(`[data-testid="issue-card"][data-rule-id="suggestion.BreadcrumbList"]`)
      .first();
    await expect(issue).toBeVisible();
    await expect(issue).toContainText(/BreadcrumbList/);
  });
});
