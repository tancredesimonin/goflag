import type { NextConfig } from "next";
import { checkCustomRoutes } from "next/dist/lib/load-custom-routes";
import { getRedirectStatus } from "next/dist/lib/redirect-status";
import { buildCustomRoute } from "next/dist/server/lib/router-utils/filesystem";
import { formatUrl } from "next/dist/shared/lib/router/utils/format-url";
import {
  matchHas,
  prepareDestination,
} from "next/dist/shared/lib/router/utils/prepare-destination";
import { describe, expect, it } from "vitest";

import { canonicalHostRedirect, type CanonicalHostRedirect } from "./canonical-host";

describe("canonicalHostRedirect — the shape", () => {
  it("sends www to the apex when baseUrl is on the apex", () => {
    expect(canonicalHostRedirect("https://example.com")).toEqual({
      source: "/:path*",
      has: [{ type: "host", value: "www\\.example\\.com" }],
      destination: "https://example.com/:path*",
      permanent: true,
    });
  });

  it("sends the apex to www when baseUrl is on www", () => {
    expect(canonicalHostRedirect("https://www.example.com")).toEqual({
      source: "/:path*",
      has: [{ type: "host", value: "example\\.com" }],
      destination: "https://www.example.com/:path*",
      permanent: true,
    });
  });

  it("matches on the hostname without the port, and keeps the port in the origin", () => {
    const redirect = canonicalHostRedirect("http://localhost:3004");

    expect(redirect.has).toEqual([{ type: "host", value: "www\\.localhost" }]);
    expect(redirect.destination).toBe("http://localhost:3004/:path*");
  });

  it("names the origin of a baseUrl that carries a path, a query or a fragment", () => {
    const redirect = canonicalHostRedirect("https://example.com/docs/?from=a#top");

    expect(redirect.has).toEqual([{ type: "host", value: "www\\.example\\.com" }]);
    expect(redirect.destination).toBe("https://example.com/:path*");
  });

  it("reads www and the host as URL parsing normalises them", () => {
    expect(canonicalHostRedirect("https://WWW.Example.COM/").destination).toBe(
      "https://www.example.com/:path*",
    );
  });

  it("leaves a host that only starts with the letters www on the apex side", () => {
    expect(canonicalHostRedirect("https://wwwhat.example").has).toEqual([
      { type: "host", value: "www\\.wwwhat\\.example" },
    ]);
  });

  it("escapes every regex character a hostname can carry, not only the dots", () => {
    // WHATWG URL parsing lets `+` through in a hostname, and `has` is a regex.
    expect(canonicalHostRedirect("https://a+b.example").has).toEqual([
      { type: "host", value: "www\\.a\\+b\\.example" },
    ]);
  });

  it("is what `redirects()` takes", () => {
    const config: NextConfig = {
      redirects: async () => [canonicalHostRedirect("https://example.com")],
    };

    expect(config.redirects).toBeTypeOf("function");
  });
});

describe("canonicalHostRedirect — what it refuses", () => {
  it.each(["", "example.com", "/docs", "//example.com"])(
    "refuses %j, which does not parse without a base",
    (baseUrl) => {
      expect(() => canonicalHostRedirect(baseUrl)).toThrow(/must be an absolute URL/);
    },
  );

  it("names what it was handed when the variable behind it is unset", () => {
    expect(() => canonicalHostRedirect(undefined as unknown as string)).toThrow(
      "baseUrl must be an absolute URL, received undefined",
    );
  });

  it.each(["example.com:3000", "localhost:3004", "ftp://example.com", "mailto:a@example.com"])(
    "refuses %j, which parses but has no http(s) origin to redirect to",
    (baseUrl) => {
      expect(() => canonicalHostRedirect(baseUrl)).toThrow(/must be http or https/);
    },
  );
});

/**
 * The result, through the code `next start` runs on it: the build's validation,
 * then the server's own route matcher, `matchHas` and `prepareDestination`, in
 * the order `resolve-routes.js` calls them. Next publishes none of this, so
 * these are `next/dist` paths and they hold for the devDependency's version
 * only. A Next that moves them fails here at the import, which says what it
 * should: the check has to be rewired, not that the redirect broke.
 */
function request(redirect: CanonicalHostRedirect, host: string, url: string) {
  const { pathname, searchParams } = new URL(url, "http://ignored");
  const route = buildCustomRoute("redirect", redirect);
  const query = Object.fromEntries(searchParams);

  const pathParams = route.match(pathname);
  if (pathParams === false) return null;
  const hostParams = matchHas({ headers: { host } } as never, query, route.has);
  if (hostParams === false) return null;

  const { parsedDestination } = prepareDestination({
    appendParamsToQuery: false,
    destination: route.destination,
    params: { ...pathParams, ...hostParams },
    query,
  });
  const { query: kept, ...destination } = parsedDestination;

  return {
    status: getRedirectStatus(redirect),
    location: formatUrl({ ...destination, search: new URLSearchParams(kept as never).toString() }),
  };
}

describe("canonicalHostRedirect — through Next's matcher", () => {
  const onApex = canonicalHostRedirect("https://example.com");

  it("passes the validation `next build` runs on a redirect", () => {
    expect(() => checkCustomRoutes([onApex], "redirect")).not.toThrow();
    expect(() =>
      checkCustomRoutes([canonicalHostRedirect("http://localhost:3004")], "redirect"),
    ).not.toThrow();
  });

  it("answers a 308 on the other host, on the root and on a deep path", () => {
    expect(request(onApex, "www.example.com", "/")).toEqual({
      status: 308,
      location: "https://example.com",
    });
    expect(request(onApex, "www.example.com", "/fr/docs/quickstart")).toEqual({
      status: 308,
      location: "https://example.com/fr/docs/quickstart",
    });
  });

  it("carries the query string over", () => {
    expect(request(onApex, "www.example.com", "/docs?utm_source=a&page=2")?.location).toBe(
      "https://example.com/docs?utm_source=a&page=2",
    );
  });

  it("works the other way round, from the apex to www", () => {
    const onWww = canonicalHostRedirect("https://www.example.com");

    expect(request(onWww, "example.com", "/docs")?.location).toBe("https://www.example.com/docs");
    expect(request(onWww, "www.example.com", "/docs")).toBeNull();
  });

  it("stays quiet on the canonical host, which is what keeps it from looping", () => {
    expect(request(onApex, "example.com", "/docs")).toBeNull();
  });

  it("ignores the port and the case of the Host header", () => {
    expect(request(onApex, "www.example.com:8443", "/docs")?.location).toBe(
      "https://example.com/docs",
    );
    expect(request(onApex, "WWW.Example.COM", "/docs")?.location).toBe("https://example.com/docs");
  });

  it("keeps the port of the origin in the location", () => {
    const local = canonicalHostRedirect("http://localhost:3004");

    expect(request(local, "www.localhost:3004", "/docs")?.location).toBe(
      "http://localhost:3004/docs",
    );
  });

  it("does not read a dot as any character, nor match part of a host", () => {
    expect(request(onApex, "wwwxexample.com", "/")).toBeNull();
    expect(request(onApex, "www.example.com.evil.test", "/")).toBeNull();
    expect(request(onApex, "evil.www.example.com", "/")).toBeNull();
  });

  it("leaves /_next alone, which Next keeps out of every redirect", () => {
    expect(request(onApex, "www.example.com", "/_next/static/chunk.js")).toBeNull();
  });
});
