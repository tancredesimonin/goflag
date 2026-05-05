import { describe, expect, it } from "vitest";
import { filenameToRoute, routeToFilename, urlToRoute } from "./route";

describe("urlToRoute", () => {
  it("strips scheme, host and port", () => {
    expect(urlToRoute("https://example.com:8080/blog/post")).toBe("/blog/post");
  });

  it("collapses an empty pathname to `/`", () => {
    expect(urlToRoute("https://example.com")).toBe("/");
  });

  it("strips a trailing slash but keeps the lone `/`", () => {
    expect(urlToRoute("https://example.com/blog/")).toBe("/blog");
    expect(urlToRoute("https://example.com/")).toBe("/");
  });

  it("strips the query string and fragment", () => {
    expect(urlToRoute("https://example.com/x?a=1#hash")).toBe("/x");
  });

  it("decodes percent-escapes in the pathname", () => {
    expect(urlToRoute("https://example.com/blog/%C3%A9diteur")).toBe("/blog/éditeur");
  });

  it("falls back to the encoded form on a malformed escape", () => {
    expect(urlToRoute("https://example.com/%E0%A4%A")).toBe("/%E0%A4%A");
  });

  it("strips repeated trailing slashes", () => {
    expect(urlToRoute("https://example.com/blog//")).toBe("/blog");
  });
});

describe("routeToFilename / filenameToRoute", () => {
  it("maps the home route to `_root`", () => {
    expect(routeToFilename("/")).toBe("_root");
    expect(filenameToRoute("_root")).toBe("/");
  });

  it("substitutes path separators with underscores", () => {
    expect(routeToFilename("/blog/post-1")).toBe("blog_post-1");
    expect(filenameToRoute("blog_post-1")).toBe("/blog/post-1");
  });

  it("percent-encodes filesystem-hostile chars", () => {
    expect(routeToFilename("/blog/é")).toBe("blog_%C3%A9");
    expect(filenameToRoute("blog_%C3%A9")).toBe("/blog/é");
  });

  it("survives a round-trip on common pathnames", () => {
    const cases = ["/", "/blog", "/blog/post-1", "/de/blog/post", "/x/y.z"];
    for (const route of cases) {
      expect(filenameToRoute(routeToFilename(route))).toBe(route);
    }
  });

  it("falls back to the raw segment when a percent-escape is malformed", () => {
    // `%E0%A4%A` is valid in `urlToRoute`'s lenient path; if it ever
    // reaches `filenameToRoute` (e.g. someone hand-edited a snapshot
    // filename) we should not throw.
    expect(filenameToRoute("blog_%E0%A4%A")).toBe("/blog/%E0%A4%A");
  });
});
