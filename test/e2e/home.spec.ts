import { expect, test } from "@playwright/test";

test("home page renders the headline and pre-alpha badge", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Headlint");
  await expect(page.getByText(/pre-alpha/i)).toBeVisible();
});
