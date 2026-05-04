/**
 * Visual regression baselines for every preview component × fixture.
 *
 * PLAN.md Phase 4.17 requires 30 screenshots committed to the repo (3
 * fixtures × 10 platforms; we ship 11 platforms so the matrix is 33).
 * Baselines live next to this spec under `preview-vr.spec.ts-snapshots/`.
 *
 * To regenerate:
 *
 *     pnpm exec playwright test test/e2e/preview-vr.spec.ts \\
 *       --update-snapshots --project=chromium
 *
 * We pin a fixed viewport and disable animations so re-runs are byte
 * stable. The harness route (`/preview-fixture`) renders one card on a
 * neutral background — no app chrome to drift.
 */

import { expect, test } from "@playwright/test";

const platforms = [
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
] as const;

const fixtures = ["full", "minimal", "missing-image"] as const;

test.describe("preview visual regression", () => {
  test.use({
    viewport: { width: 800, height: 800 },
  });

  for (const platform of platforms) {
    for (const fixture of fixtures) {
      test(`${platform} × ${fixture}`, async ({ page }) => {
        // Block external images BEFORE navigating so the placeholder
        // (PreviewImage's "No image" tile) renders deterministically. We
        // never want a baseline to depend on a live CDN.
        await page.route("**/*", (route) => {
          const url = route.request().url();
          if (
            url.startsWith("http://localhost") ||
            url.startsWith("http://127.0.0.1") ||
            url.startsWith("data:")
          ) {
            return route.continue();
          }
          if (route.request().resourceType() === "image") {
            return route.abort();
          }
          return route.continue();
        });
        await page.goto(`/preview-fixture?platform=${platform}&fixture=${fixture}`);
        const root = page.getByTestId("vr-root");
        await expect(root).toBeVisible();
        await expect(root).toHaveScreenshot(`${platform}-${fixture}.png`, {
          // Tiny tolerance for sub-pixel font renderering across runners.
          maxDiffPixelRatio: 0.02,
          animations: "disabled",
        });
      });
    }
  }
});
