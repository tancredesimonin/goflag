import { describe, expect, it } from "vitest";
import { normalizeInputUrl } from "./normalize-url";

describe("normalizeInputUrl", () => {
  it("prepends https:// to a bare domain", () => {
    expect(normalizeInputUrl("tancrede.eu")).toEqual({ ok: true, url: "https://tancrede.eu" });
  });

  it("prepends https:// to a bare domain with a path and query", () => {
    expect(normalizeInputUrl("example.com/blog?page=2")).toEqual({
      ok: true,
      url: "https://example.com/blog?page=2",
    });
  });

  it("trims surrounding whitespace before normalizing", () => {
    expect(normalizeInputUrl("  tancrede.eu  ")).toEqual({ ok: true, url: "https://tancrede.eu" });
  });

  it("keeps an explicit http:// scheme untouched", () => {
    expect(normalizeInputUrl("http://example.com")).toEqual({ ok: true, url: "http://example.com" });
  });

  it("keeps an explicit https:// scheme untouched", () => {
    expect(normalizeInputUrl("https://example.com/path")).toEqual({
      ok: true,
      url: "https://example.com/path",
    });
  });

  it("handles host:port without a scheme (e.g. localhost:3000)", () => {
    expect(normalizeInputUrl("localhost:3000")).toEqual({
      ok: true,
      url: "https://localhost:3000",
    });
  });

  it("rejects an empty or whitespace-only string", () => {
    expect(normalizeInputUrl("")).toEqual({ ok: false });
    expect(normalizeInputUrl("   ")).toEqual({ ok: false });
  });

  it("rejects a non-http(s) scheme", () => {
    expect(normalizeInputUrl("ftp://example.com")).toEqual({ ok: false });
    expect(normalizeInputUrl("file:///etc/hosts")).toEqual({ ok: false });
  });

  it("rejects input the URL parser cannot make sense of", () => {
    expect(normalizeInputUrl("not a url")).toEqual({ ok: false });
    expect(normalizeInputUrl("http://")).toEqual({ ok: false });
  });
});
