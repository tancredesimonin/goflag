/**
 * Phase 4.18 — E2E for the live Previews tab.
 *
 *  - Navigate to /inspect for a fixture URL with a fully populated head;
 *  - assert the Previews tab renders one tile per platform;
 *  - flip off `og:image` via the "What if?" sheet;
 *  - assert Facebook + LinkedIn images vanish (they have no twitter:image
 *    fallback) while X keeps an image (twitter:image).
 *
 * The fixture server is the same Hono server boot that Phase 3 uses (see
 * `playwright.config.ts` webServer array, fixed port 4322).
 */

import { expect, test } from "@playwright/test";

const fixtureBase = "http://127.0.0.1:4322";

/**
 * Tiny 1×1 transparent PNG — used to intercept image requests so the
 * preview cards always render their <img> element (rather than swapping
 * to the placeholder via the onError handler when the fixture's
 * `og:image` URL 404s against Next).
 */
const ONE_BY_ONE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

async function stubImages(page: import("@playwright/test").Page) {
  await page.route("**/*", (route) => {
    if (route.request().resourceType() === "image") {
      return route.fulfill({
        status: 200,
        contentType: "image/png",
        body: ONE_BY_ONE_PNG,
      });
    }
    return route.continue();
  });
}

test.describe("previews tab", () => {
  test("renders all 11 preview cards and What-if degrades them", async ({ page }) => {
    await stubImages(page);
    const target = `${fixtureBase}/fr?mode=static`;
    await page.goto(`/inspect?url=${encodeURIComponent(target)}`);
    // Switch to the Previews tab (base-ui renders the trigger twice; pick
    // the visible one by role).
    await page.getByRole("tab", { name: "Previews" }).first().click();

    const tiles = page.getByTestId("preview-tile");
    await expect(tiles.first()).toBeVisible();
    // 11 platforms ship in Phase 4 (PLAN says 10; we ship the X summary +
    // summary_large_image as separate cards).
    await expect(tiles).toHaveCount(11);

    // Every platform id is rendered.
    for (const id of [
      "google-serp-desktop",
      "google-serp-mobile",
      "x-card-summary-large",
      "x-card-summary",
      "facebook",
      "linkedin",
      "discord",
      "slack",
      "whatsapp",
      "imessage",
      "pinterest",
    ]) {
      await expect(page.locator(`[data-testid="preview-tile"][data-platform="${id}"]`)).toHaveCount(
        1,
      );
    }

    // Pre-suppression: facebook + linkedin + X large all have an <img>.
    const findImg = (platform: string) =>
      page.locator(`[data-testid="preview-tile"][data-platform="${platform}"] img`).first();
    await expect(findImg("facebook")).toBeVisible();
    await expect(findImg("linkedin")).toBeVisible();
    await expect(findImg("x-card-summary-large")).toBeVisible();

    // Open the What-if drawer.
    await page.getByTestId("whatif-trigger").first().click();
    const ogImageRow = page
      .locator('[data-testid="whatif-row"][data-key="meta:property=og:image"]')
      .first();
    await expect(ogImageRow).toBeVisible();
    // Sheet's ScrollArea may render the row below the viewport in chromium
    // even when "visible". Dispatch the click via DOM directly — the
    // toggle is a plain <button> with an onClick handler.
    await ogImageRow.getByTestId("whatif-toggle").evaluate((el) => {
      (el as HTMLButtonElement).click();
    });

    // Suppression count surfaces.
    await expect(page.getByTestId("previews-removed-count").first()).toHaveText(/1 suppressed/);

    // Facebook + LinkedIn lose their image. X keeps it (twitter:image is
    // still in play).
    await expect(
      page.locator('[data-testid="preview-tile"][data-platform="facebook"] img'),
    ).toHaveCount(0);
    await expect(
      page.locator('[data-testid="preview-tile"][data-platform="linkedin"] img'),
    ).toHaveCount(0);
    await expect(findImg("x-card-summary-large")).toBeVisible();

    // Reset clears the suppression set.
    // The sheet may be in front of the reset button; close it by clicking
    // outside (the backdrop) before hitting reset.
    await page.keyboard.press("Escape");
    await page.getByTestId("previews-reset").first().click();
    await expect(page.getByTestId("previews-removed-count")).toHaveCount(0);
    await expect(findImg("facebook")).toBeVisible();
  });

  test("sidebar nav links scroll to the matching preview", async ({ page }) => {
    await stubImages(page);
    const target = `${fixtureBase}/fr?mode=static`;
    await page.goto(`/inspect?url=${encodeURIComponent(target)}`);
    await page.getByRole("tab", { name: "Previews" }).first().click();

    // One nav link per platform, all rendered together.
    await expect(page.getByTestId("previews-nav-link")).toHaveCount(11);

    // Clicking a nav link scrolls its preview into view.
    await page.locator('[data-testid="previews-nav-link"][data-platform="discord"]').click();
    await expect(
      page.locator('[data-testid="preview-tile"][data-platform="discord"]'),
    ).toBeInViewport();
  });
});
