/**
 * Visual regression baselines for every preview component × fixture.
 *
 * PLAN.md Phase 4.17 requires 30 screenshots committed to the repo (3
 * fixtures × 10 platforms; we ship 11 platforms so the matrix is 33).
 * Baselines live next to this spec under `preview-vr.spec.ts-snapshots/`.
 *
 * SKIPPED ON CI (temporary). The committed baselines were baked on macOS
 * (`*-chromium-darwin.png`) but the CI runner is Linux and Playwright
 * suffixes by OS, so it would look for `*-chromium-linux.png` and fail.
 * Until we bake Linux baselines via the official Playwright Docker image
 * (`mcr.microsoft.com/playwright:v1.59.1-noble`), the suite runs locally
 * only — CI re-enables once the Linux PNGs land. Tracked in PLAN.md
 * under "Pre-launch checklist".
 *
 * To regenerate (locally, macOS):
 *
 *     pnpm exec playwright test test/e2e/preview-vr.spec.ts \\
 *       --update-snapshots --project=chromium
 *
 * To bake Linux baselines (one-shot, requires Docker):
 *
 *     docker run --rm -v "$(pwd):/work" -w /work \\
 *       -e CI=1 mcr.microsoft.com/playwright:v1.59.1-noble \\
 *       bash -c "corepack enable && \\
 *         corepack prepare pnpm@9.15.0 --activate && \\
 *         pnpm install --frozen-lockfile && \\
 *         pnpm exec playwright test test/e2e/preview-vr.spec.ts \\
 *           --update-snapshots --project=chromium"
 *
 * We pin a fixed viewport and disable animations so re-runs are byte
 * stable. The harness route (`/preview-fixture`) renders one card on a
 * neutral background — no app chrome to drift.
 */

import { expect, test } from "@playwright/test";

// CI lacks Linux baselines (see header). Skip the whole VR file there.
test.skip(
  Boolean(process.env.CI),
  "Visual regression baselines are macOS-only for now; CI re-enables once Linux PNGs are baked. See PLAN.md → Pre-launch checklist.",
);

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
