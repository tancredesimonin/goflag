import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startAuditFixtureServer, type AuditFixtureServer } from "../audit-fixture-server";
import { runLinkAudit, runFullAudit, hasLinkAudit } from "@/app/actions/audit";
import { clearLinkAuditStore, getLinkAudit } from "@/lib/store/link-audit-store";
import { clearSiteStore } from "@/lib/store/site-store";

// revalidatePath throws outside an App Router request scope — stub it so
// the actions can be invoked from a vitest worker.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let site: AuditFixtureServer;

beforeAll(async () => {
  site = await startAuditFixtureServer();
});
afterAll(async () => {
  await site.stop();
});
beforeEach(() => {
  clearLinkAuditStore();
  clearSiteStore();
});

describe("runLinkAudit Server Action", () => {
  it("discovers, audits, and caches a report for a real fixture site", async () => {
    const result = await runLinkAudit({ url: site.url });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.pagesScanned).toBeGreaterThan(0);
    expect(result.summary.broken).toBeGreaterThanOrEqual(1);

    const cached = getLinkAudit(site.url);
    expect(cached).toBeDefined();
    expect(await hasLinkAudit(site.url)).toBe(true);
  });

  it("rejects malformed URLs with code=invalid-url", async () => {
    const result = await runLinkAudit({ url: "not-a-url" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error");
    expect(result.error.code).toBe("invalid-url");
  });
});

describe("runFullAudit Server Action", () => {
  it("runs discovery plus the link audit by default", async () => {
    const result = await runFullAudit({ url: site.url });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.ranLinks).toBe(true);
    expect(result.urlCount).toBeGreaterThan(0);
    expect(getLinkAudit(site.url)).toBeDefined();
  });

  it("can skip the link audit when links:false", async () => {
    const result = await runFullAudit({ url: site.url, links: false });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.ranLinks).toBe(false);
    expect(getLinkAudit(site.url)).toBeUndefined();
  });

  it("rejects malformed URLs", async () => {
    const result = await runFullAudit({ url: "" });
    expect(result.ok).toBe(false);
  });
});
