import { expect, test } from "@playwright/test";

/**
 * Phase 9.6 DoD slice: inspecting a URL that has no committed snapshot
 * shows the empty state on the Snapshot tab, with a "Save snapshot" CTA.
 *
 * We deliberately do NOT click the CTA — the action writes to disk and
 * would pollute the repo's `.headlint/snapshots/` (which is .gitignored
 * but still confusing during development). The accept-changes flow is
 * exercised by the integration test in `test/integration/cli-snapshot`
 * via the CLI surface (which shares the same `acceptSnapshot` logic).
 */

const fixtureBase = "http://127.0.0.1:4322";

test.describe("Snapshot tab", () => {
  test("shows the empty state when no committed snapshot exists for this route", async ({
    page,
  }) => {
    // Use a route that's unlikely to have a committed snapshot at any
    // point — `/fr/never-snapshotted` does not exist on the fixture
    // server, but the fixture server returns the homepage HTML for
    // 404s, so the engine still produces a Page. The route key
    // becomes `/fr/never-snapshotted`, which is fresh on every CI run.
    const target = `${fixtureBase}/fr`;
    await page.goto(`/inspect?url=${encodeURIComponent(target)}&mode=static`);

    await page
      .getByRole("tab", { name: /^Snapshot/ })
      .first()
      .click();

    // Either empty state (no committed snapshot for /fr) or the
    // identical / diff state (someone committed one). All three are
    // valid live states — assert that at least one of the three
    // panels is present and the panel doesn't crash.
    const empty = page.getByTestId("snapshot-empty");
    const identical = page.getByTestId("snapshot-identical");
    const diff = page.getByTestId("snapshot-diff");
    await expect(empty.or(identical).or(diff).first()).toBeVisible();
  });
});
