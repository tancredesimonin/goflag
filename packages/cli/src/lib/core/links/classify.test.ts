import { describe, expect, it } from "vitest";
import { classifyLink } from "./classify";

describe("classifyLink", () => {
  it("classifies 2xx with no redirect as ok", () => {
    expect(classifyLink({ status: 200, redirected: false })).toBe("ok");
    expect(classifyLink({ status: 204, redirected: false })).toBe("ok");
  });

  it("classifies 2xx after a redirect as redirect", () => {
    expect(classifyLink({ status: 200, redirected: true })).toBe("redirect");
  });

  it("classifies network errors (status 0) as broken", () => {
    expect(classifyLink({ status: 0, redirected: false, reason: "dns" })).toBe("broken");
  });

  it("classifies redirect loops as broken", () => {
    expect(classifyLink({ status: 302, redirected: true, loop: true })).toBe("broken");
  });

  it("classifies 403 and 429 as blocked (likely anti-bot)", () => {
    expect(classifyLink({ status: 403, redirected: false })).toBe("blocked");
    expect(classifyLink({ status: 429, redirected: false })).toBe("blocked");
  });

  it("classifies other 4xx / 5xx as broken", () => {
    expect(classifyLink({ status: 404, redirected: false })).toBe("broken");
    expect(classifyLink({ status: 410, redirected: false })).toBe("broken");
    expect(classifyLink({ status: 500, redirected: false })).toBe("broken");
  });

  it("classifies soft-404 (200 saying not found) as warning", () => {
    expect(classifyLink({ status: 200, redirected: false, softNotFound: true })).toBe("warning");
  });

  it("classifies an unresolved 3xx as broken", () => {
    expect(classifyLink({ status: 302, redirected: true })).toBe("broken");
  });

  it("classifies 1xx as broken", () => {
    expect(classifyLink({ status: 100, redirected: false })).toBe("broken");
  });

  it("treats loop as broken even when soft-404 also set", () => {
    expect(classifyLink({ status: 200, redirected: true, loop: true, softNotFound: true })).toBe(
      "broken",
    );
  });
});
