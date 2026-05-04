import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startFixtureServer, type FixtureServer } from "../fixture-server";
import { runInspect } from "@/app/actions/inspect";
import { clearInspectCache, getCachedPage } from "@/lib/store/inspect-cache";

// Server Actions normally wrap with `revalidatePath`, which throws outside an
// App Router request scope. Stub it so the action can be invoked from a
// vitest worker without a full Next runtime.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let server: FixtureServer;

beforeAll(async () => {
  server = await startFixtureServer({
    root: resolve(__dirname, "../../fixtures/sites/tancrede"),
  });
});

afterAll(async () => {
  await server.stop();
});

beforeEach(() => clearInspectCache());

describe("runInspect Server Action", () => {
  it("returns ok+url and stores the Page in cache for a real fixture URL", async () => {
    const url = `${server.url}/fr`;
    const result = await runInspect({ url, mode: "static" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.url).toBe(url);
    const cached = getCachedPage(url);
    expect(cached).toBeDefined();
    expect(cached?.fetch.status).toBe(200);
    expect(cached?.meta.title?.value).toBeDefined();
  });

  it("rejects empty / malformed URLs with code=invalid-url", async () => {
    const result = await runInspect({ url: "" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error");
    expect(result.error.code).toBe("invalid-url");
  });

  it("rejects URLs without an http/https scheme", async () => {
    const result = await runInspect({ url: "ftp://example.com" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error");
    expect(result.error.code).toBe("invalid-url");
  });

  it("returns code=fetch-failed for an unreachable URL without throwing", async () => {
    const result = await runInspect({
      url: "http://127.0.0.1:1/",
      mode: "static",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error");
    expect(result.error.code).toBe("fetch-failed");
    expect(result.error.message).toMatch(/.+/);
  });
});
