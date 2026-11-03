import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  fetchScoped,
  headersFor,
  parseHeaderArg,
  RESERVED_HEADER_NAMES,
  sameOrigin,
  type ScopedHeaders,
} from "./scoped-headers";

const SECRET = "s3cr3t-0f-the-preview";

describe("parseHeaderArg", () => {
  it("splits on the first colon and trims both sides", () => {
    expect(parseHeaderArg("X-Preview-Token:  abc ")).toEqual({
      name: "X-Preview-Token",
      value: "abc",
    });
    expect(parseHeaderArg("Authorization: Basic dXNlcjpwYXNz:with:colons")).toEqual({
      name: "Authorization",
      value: "Basic dXNlcjpwYXNz:with:colons",
    });
    expect(parseHeaderArg("Cookie: session=1; theme=dark").name).toBe("Cookie");
  });

  it.each([
    ["no colon", `X-Token ${SECRET}`],
    ["an empty name", `: ${SECRET}`],
    ["a name with a space", `X Token: ${SECRET}`],
    ["an empty value", "X-Token:   "],
    ["a line break in the value", `X-Token: ${SECRET}\r\nX-Other: 1`],
  ])("refuses %s, without quoting the value", (_, raw) => {
    expect(() => parseHeaderArg(raw)).toThrow(/--header/);
    try {
      parseHeaderArg(raw);
    } catch (err) {
      expect((err as Error).message).not.toContain(SECRET);
    }
  });

  it("refuses the names goflag sets itself, whatever their case", () => {
    for (const name of RESERVED_HEADER_NAMES) {
      const upper = name.toUpperCase();
      expect(() => parseHeaderArg(`${upper}: ${SECRET}`)).toThrow(/set by goflag itself/);
    }
  });
});

describe("sameOrigin", () => {
  const origin = "https://preview.example.com";

  it.each([
    ["the origin itself", "https://preview.example.com/fr/page?x=1", true],
    ["its default port spelled out", "https://preview.example.com:443/", true],
    ["another scheme", "http://preview.example.com/", false],
    ["another port", "https://preview.example.com:8443/", false],
    ["a subdomain", "https://cdn.preview.example.com/", false],
    ["the parent domain", "https://example.com/", false],
    ["a lookalike suffix", "https://preview.example.com.evil.test/", false],
    ["something that is not a URL", "not a url", false],
  ])("%s", (_, url, expected) => {
    expect(sameOrigin(url, origin)).toBe(expected);
  });

  it("compares an internationalised host by its ASCII form", () => {
    const idn = new URL("https://bücher.example").origin;
    expect(idn).toBe("https://xn--bcher-kva.example");
    expect(sameOrigin("https://bücher.example/katalog", idn)).toBe(true);
  });
});

describe("headersFor", () => {
  const scope: ScopedHeaders = {
    origin: "https://preview.example.com",
    headers: { "X-Token": SECRET },
  };

  it("gives the headers to the origin and nothing to anyone else", () => {
    expect(headersFor("https://preview.example.com/a", scope)).toEqual({ "X-Token": SECRET });
    expect(headersFor("https://cdn.example.com/a.png", scope)).toEqual({});
    expect(headersFor("https://preview.example.com/a", undefined)).toEqual({});
  });

  it("hands out a copy, so a caller cannot edit the scope", () => {
    const given = headersFor("https://preview.example.com/a", scope);
    given["X-Token"] = "changed";
    expect(scope.headers["X-Token"]).toBe(SECRET);
  });
});

/**
 * Two real servers on loopback: `site`, which answers only with the token, and
 * `other`, a different origin that records what it was sent. `127.0.0.1` and
 * `localhost` would also be two origins, but two ports make the point without
 * relying on name resolution.
 */
describe("fetchScoped", () => {
  let site: Server;
  let other: Server;
  let siteUrl = "";
  let otherUrl = "";
  const siteSaw: { path: string; token: string | undefined }[] = [];
  const otherSaw: IncomingHttpHeaders[] = [];

  const listen = (server: Server) =>
    new Promise<string>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        resolve(`http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`);
      });
    });

  beforeAll(async () => {
    other = createServer((req, res) => {
      otherSaw.push(req.headers);
      res.writeHead(200, { "content-type": "text/plain" }).end("elsewhere");
    });
    otherUrl = await listen(other);

    site = createServer((req, res) => {
      const token = req.headers["x-token"] as string | undefined;
      siteSaw.push({ path: req.url ?? "", token });
      if (token !== SECRET) return void res.writeHead(401).end("token required");
      if (req.url === "/same") return void res.writeHead(302, { location: "/final" }).end();
      if (req.url === "/cross") {
        return void res.writeHead(307, { location: `${otherUrl}/landing` }).end();
      }
      if (req.url === "/loop") return void res.writeHead(302, { location: "/loop" }).end();
      res.writeHead(200, { "content-type": "text/plain" }).end(`page ${req.url}`);
    });
    siteUrl = await listen(site);
  });

  afterAll(async () => {
    await new Promise((resolve) => site.close(resolve));
    await new Promise((resolve) => other.close(resolve));
  });

  const scope = () => ({ origin: new URL(siteUrl).origin, headers: { "X-Token": SECRET } });

  it("is plain fetch without a scope", async () => {
    const res = await fetchScoped(`${siteUrl}/page`, {}, undefined);
    expect(res.status).toBe(401);
  });

  it("sends the headers to the origin, and keeps the caller's own", async () => {
    siteSaw.length = 0;
    const res = await fetchScoped(
      `${siteUrl}/page`,
      { headers: { accept: "text/plain" } },
      scope(),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("page /page");
    expect(siteSaw).toEqual([{ path: "/page", token: SECRET }]);
  });

  it("follows a redirect within the origin with the headers on every hop", async () => {
    siteSaw.length = 0;
    const res = await fetchScoped(`${siteUrl}/same`, { redirect: "follow" }, scope());
    expect(res.status).toBe(200);
    expect(res.url).toBe(`${siteUrl}/final`);
    expect(res.redirected).toBe(true);
    expect(siteSaw).toEqual([
      { path: "/same", token: SECRET },
      { path: "/final", token: SECRET },
    ]);
  });

  it("does not carry the headers across a redirect to another origin", async () => {
    otherSaw.length = 0;
    const res = await fetchScoped(`${siteUrl}/cross`, {}, scope());
    expect(res.status).toBe(200);
    expect(res.url).toBe(`${otherUrl}/landing`);
    expect(otherSaw).toHaveLength(1);
    expect(otherSaw[0]!["x-token"]).toBeUndefined();
  });

  it("sends nothing to another origin asked directly", async () => {
    otherSaw.length = 0;
    await fetchScoped(`${otherUrl}/pixel.png`, {}, scope());
    expect(otherSaw).toHaveLength(1);
    expect(JSON.stringify(otherSaw[0])).not.toContain(SECRET);
  });

  it("stays a single request under redirect: manual", async () => {
    siteSaw.length = 0;
    const res = await fetchScoped(`${siteUrl}/same`, { redirect: "manual" }, scope());
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/final");
    expect(siteSaw).toEqual([{ path: "/same", token: SECRET }]);
  });

  it("gives up on a redirect loop the way fetch does", async () => {
    await expect(fetchScoped(`${siteUrl}/loop`, {}, scope())).rejects.toThrow(
      /redirect count exceeded/,
    );
  });
});
