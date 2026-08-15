/**
 * One test per row of the semantics table in `./match.ts`.
 *
 * These are the rules whose subtleties decide whether a finding is real. A
 * matcher that gets precedence backwards would report a blocked page on a site
 * that allows it, which is the worst thing an auditor can do.
 */

import { describe, expect, it } from "vitest";

import { parseRobots } from "./parse";
import { robotsAllows } from "./match";

const allows = (body: string, path: string, agent?: string) =>
  robotsAllows(parseRobots(body).groups, path, agent).allowed;

describe("robotsAllows — group selection", () => {
  it("prefers a matching product token over `*`", () => {
    const body = "User-agent: *\nDisallow: /\n\nUser-agent: goflag\nAllow: /";

    expect(allows(body, "/page", "goflag")).toBe(true);
    expect(allows(body, "/page", "someone-else")).toBe(false);
  });

  it("prefers the longest matching token", () => {
    const body = "User-agent: googlebot\nDisallow: /\n\nUser-agent: googlebot-image\nAllow: /\n";

    expect(allows(body, "/x", "googlebot-image")).toBe(true);
    expect(allows(body, "/x", "googlebot")).toBe(false);
  });

  it("matches a token against the head of the crawler's name", () => {
    expect(allows("User-agent: goflag\nDisallow: /", "/x", "goflag/1.2 (+url)")).toBe(false);
  });

  it("is case-insensitive about agents", () => {
    expect(allows("User-agent: GoFlag\nDisallow: /", "/x", "goflag")).toBe(false);
  });

  it("merges duplicate groups for one agent", () => {
    // A file that names `*` twice means the union; reading only the first
    // group would miss the second's rules.
    const body = "User-agent: *\nDisallow: /a\n\nUser-agent: *\nDisallow: /b";

    expect(allows(body, "/b", "*")).toBe(false);
  });

  it("allows everything when no group applies", () => {
    // A file that speaks only to Googlebot says nothing about anyone else.
    expect(allows("User-agent: googlebot\nDisallow: /", "/x", "goflag")).toBe(true);
  });
});

describe("robotsAllows — precedence", () => {
  it("gives the longest match the decision", () => {
    const body = "User-agent: *\nDisallow: /admin\nAllow: /admin/public";

    expect(allows(body, "/admin/secret")).toBe(false);
    expect(allows(body, "/admin/public/x")).toBe(true);
  });

  it("gives a tie to `allow`, per §2.2.2", () => {
    const body = "User-agent: *\nDisallow: /page\nAllow: /page";

    expect(allows(body, "/page")).toBe(true);
  });

  it("does not care about the order rules were written in", () => {
    const reversed = "User-agent: *\nAllow: /admin/public\nDisallow: /admin";

    expect(allows(reversed, "/admin/secret")).toBe(false);
    expect(allows(reversed, "/admin/public/x")).toBe(true);
  });
});

describe("robotsAllows — wildcards", () => {
  it("treats `*` as any sequence", () => {
    expect(allows("User-agent: *\nDisallow: /*.pdf", "/docs/manual.pdf")).toBe(false);
    expect(allows("User-agent: *\nDisallow: /*.pdf", "/docs/manual.html")).toBe(true);
  });

  it("treats `$` as an end anchor", () => {
    const body = "User-agent: *\nDisallow: /page$";

    expect(allows(body, "/page")).toBe(false);
    expect(allows(body, "/page/child")).toBe(true);
  });

  it("matches a bare pattern as a prefix", () => {
    expect(allows("User-agent: *\nDisallow: /admin", "/administrator")).toBe(false);
  });

  it("reads regex metacharacters in a pattern literally", () => {
    // `.` and `+` are characters in a path, not operators.
    expect(allows("User-agent: *\nDisallow: /a.b", "/axb")).toBe(true);
    expect(allows("User-agent: *\nDisallow: /a.b", "/a.b")).toBe(false);
  });
});

describe("robotsAllows — encoding and case", () => {
  it("treats an encoded path and its bare form as one path", () => {
    expect(allows("User-agent: *\nDisallow: /café", "/caf%C3%A9")).toBe(false);
    expect(allows("User-agent: *\nDisallow: /caf%C3%A9", "/café")).toBe(false);
  });

  it("keeps paths case-sensitive", () => {
    expect(allows("User-agent: *\nDisallow: /Admin", "/admin")).toBe(true);
  });

  it("answers rather than throwing on a malformed escape", () => {
    expect(() => allows("User-agent: *\nDisallow: /%zz", "/%zz")).not.toThrow();
  });
});

describe("robotsAllows — the permissive cases", () => {
  it("allows everything on an empty `Disallow:`", () => {
    expect(allows("User-agent: *\nDisallow:", "/anything")).toBe(true);
  });

  it("allows everything on an empty file", () => {
    expect(allows("", "/anything")).toBe(true);
  });

  it("allows a path no rule mentions", () => {
    expect(allows("User-agent: *\nDisallow: /admin", "/about")).toBe(true);
  });

  it("reports which rule decided, so a finding can quote it", () => {
    const decision = robotsAllows(
      parseRobots("User-agent: *\nDisallow: /admin").groups,
      "/admin/x",
    );

    expect(decision.allowed).toBe(false);
    expect(decision.rule).toMatchObject({ kind: "disallow", pattern: "/admin", line: 2 });
    expect(decision.group).toBe("*");
  });
});
