import { expect, test } from "@playwright/test";

const FIXTURE = "http://127.0.0.1:4324";

// The suite shares process-global in-memory stores on the Next server;
// run these specs serially so concurrent audits of the same origin don't
// interleave (and to avoid streamed-shell duplication under parallel load).
test.describe.configure({ mode: "serial" });

/**
 * Goflag Suite end-to-end: enter the base URL once on the home page,
 * land on the dashboard, and verify all three feature pages populate from
 * the single shared discovery.
 */
test("base URL once → dashboard + all three lenses populate", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("audit-input").fill(FIXTURE);
  await page.getByTestId("audit-submit").click();

  // Lands on the dashboard with three result cards.
  await expect(page).toHaveURL(/\/dashboard\?url=/);
  await expect(page.getByTestId("dash-card-sitemap")).toBeVisible();
  await expect(page.getByTestId("dash-card-head")).toBeVisible();
  await expect(page.getByTestId("dash-card-links")).toBeVisible();

  // Links lens: the audit ran during runFullAudit, so the broken-links
  // table is populated. The fixture deliberately links a dead /missing URL.
  await page.getByTestId("dash-card-links").click();
  await expect(page).toHaveURL(/\/links\?url=/);
  await expect(page.getByTestId("link-audit-summary").first()).toBeVisible();
  const brokenRows = page.locator('[data-testid="link-row"][data-verdict="broken"]');
  await expect(brokenRows.first()).toBeVisible();
  await expect(page.getByTestId("broken-links-table").first()).toContainText("/missing");
});

test("sitemap lens shows the strengthened health checklist", async ({ page }) => {
  await page.goto(`/site?url=${encodeURIComponent(FIXTURE)}`);
  await expect(page.getByTestId("sitemap-analysis").first()).toBeVisible();
  await expect(page.getByTestId("sitemap-health").first()).toBeVisible();
  // The fixture sitemap lists /missing (404) → at least one broken entry.
  await expect(page.getByTestId("reachable-pct").first()).toBeVisible();
});

test("links lens filters by verdict", async ({ page }) => {
  await page.goto(`/links?url=${encodeURIComponent(FIXTURE)}`);
  await expect(page.getByTestId("broken-links-table").first()).toBeVisible();

  // Default view hides ok links; toggling the redirect filter (if present)
  // or scope filter keeps the table interactive.
  const externalFilter = page.locator('[data-testid="kind-filter"][data-kind="external"]');
  await externalFilter.click();
  const rows = page.locator('[data-testid="link-row"]');
  // Every visible row is external after filtering.
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    await expect(rows.nth(i)).toHaveAttribute("data-kind", "external");
  }
});
