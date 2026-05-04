import { expect, test } from "@playwright/test";

/**
 * Phase 3 DoD slice: end-to-end the home page → Server Action → /inspect
 * route against the local fixture server. Covers PLAN.md 3.13 (happy
 * path) and 3.14 (error path).
 *
 * The fixture server is spawned by Playwright's `webServer` config (see
 * `playwright.config.ts`), bound to a fixed port so we can hit it from the
 * Headlint app and reference it from these specs without a sidecar file.
 */

const fixtureBase = "http://127.0.0.1:4322";

test.describe("inspect flow", () => {
  test("submits a fixture URL and renders header + Raw tab", async ({ page }) => {
    const target = `${fixtureBase}/fr`;
    await page.goto("/");

    await page.getByTestId("url-input").fill(target);
    await Promise.all([page.waitForURL(/\/inspect\?/), page.getByTestId("inspect-submit").click()]);

    await expect(page.getByTestId("header-title")).toContainText(/Tancrède/i);
    await expect(page.getByTestId("header-status")).toContainText("200");
    await expect(page.getByTestId("header-url")).toContainText(target);

    // Raw tab is the default — list of head tags should include <title>.
    const rawList = page.getByTestId("raw-tag-list");
    await expect(rawList).toBeVisible();
    await expect(rawList).toContainText("<title>", { useInnerText: false });

    // Sidebar reflects the inspected URL — assert presence in the DOM.
    // Visibility is finicky here because the shadcn sidebar can render in a
    // closed/icon-only state on narrow viewports, but the Link is always
    // mounted regardless.
    const sidebarItem = page.locator(`[data-testid="sidebar-item"][data-url="${target}"]`);
    await expect(sidebarItem).toHaveCount(1);
  });

  test("Re-fetch button updates the view without a hard reload", async ({ page }) => {
    // /fr has a fully populated static <head>, so auto mode stays in
    // static and we don't depend on a Chromium install in this E2E worker.
    const target = `${fixtureBase}/fr`;
    await page.goto(`/inspect?url=${encodeURIComponent(target)}&mode=static`);
    // Strict mode tolerates whichever copy renders first in case React's
    // streaming Suspense boundary renders the resolved content twice.
    await expect(page.getByTestId("header-title").first()).toBeVisible();
    const refetch = page.getByTestId("refetch-button").first();
    await expect(refetch).toBeEnabled();
    await refetch.click();
    // Toast surfaces the success path.
    await expect(page.getByText(/Re-fetched/i)).toBeVisible();
  });

  test("filtering the Raw tab narrows the list", async ({ page }) => {
    const target = `${fixtureBase}/fr`;
    await page.goto(`/inspect?url=${encodeURIComponent(target)}`);
    // base-ui Tabs duplicate the panel for measurement; pick the visible one.
    const filter = page.getByTestId("raw-filter").first();
    await filter.fill("og:image");
    const rows = page.getByTestId("raw-tag-row");
    await expect(rows.first()).toBeVisible();
    await expect(rows.first()).toContainText("og:image");
  });

  test("unreachable URL surfaces a toast and does not crash the page", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("url-input").fill("http://127.0.0.1:1/never-listening");
    await page.getByTestId("inspect-submit").click();

    // The form-level error message renders inline.
    await expect(page.getByTestId("url-form-error")).toBeVisible();

    // Sonner toast appears in the corner — message text varies by error
    // class (FetchError vs Network error vs ECONNREFUSED), so we assert on
    // the toast container existing rather than the exact wording.
    await expect(page.locator("[data-sonner-toast]").first()).toBeVisible();

    // Page is still interactive — no white-screen crash.
    await expect(page.getByTestId("url-input")).toBeEnabled();
  });

  test("Assets tab shows favicons, manifest, and robots blocks", async ({ page }) => {
    const target = `${fixtureBase}/fr`;
    await page.goto(`/inspect?url=${encodeURIComponent(target)}`);
    // base-ui renders the trigger twice (once visible, once for keyboard
    // measurement) — pick the visible one by role.
    await page.getByRole("tab", { name: "Assets" }).first().click();
    await expect(page.getByTestId("favicon-grid")).toBeVisible();
    await expect(page.getByTestId("robots-status").first()).toBeVisible();
  });
});
