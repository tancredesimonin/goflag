import { expect, test } from "@playwright/test";

/**
 * Phase 7 DoD slice: inspecting a single page from the i18n-grid
 * fixture should expose the new "i18n" tab with the hreflang matrix
 * pre-populated from the page's own alternates (single-page mode —
 * cross-page reciprocity comes in once the in-app crawler ships in
 * Phase 8). The matrix should render at least one route × one locale
 * cell and tag known cells as `inspected` or `declared`.
 */
const fixtureBase = "http://127.0.0.1:4323";
const target = `${fixtureBase}/en/blog/post`;

test.describe("i18n matrix", () => {
  test("page declares hreflang alternates that fill the matrix grid", async ({ page }) => {
    await page.goto(`/inspect?url=${encodeURIComponent(target)}`);
    await expect(page.getByTestId("header-title").first()).toBeVisible();

    await page.getByTestId("tab-i18n").first().click();

    const matrix = page.getByTestId("i18n-matrix").first();
    await expect(matrix).toBeVisible();

    const localeBadges = matrix.locator('[data-testid="i18n-matrix-locale"]');
    await expect(localeBadges).toHaveCount(5); // x-default + en + fr + de + es

    // At least one cell should be in the `declared` state — the
    // alternates point at URLs we haven't (yet) inspected, so the
    // matrix marks them amber.
    const declared = matrix.locator('[data-testid="i18n-matrix-cell"][data-state="declared"]');
    await expect(declared.first()).toBeVisible();
  });
});
