/**
 * The asset probe against a real server.
 *
 * Everything the three reachability rules conclude rests on two claims this
 * file is here to check: that the probe tells an image from an app shell that
 * answers 200, and that it can read a size out of the first bytes of a file
 * without downloading the rest. Neither is provable with a hand-written
 * fixture — the second one is specifically about what goes over a socket.
 */

import { serve, type ServerType } from "@hono/node-server";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { probeAsset } from "../../src/lib/core/probes/assets";

/** A PNG that honestly declares 1200×630 in its IHDR. */
function png(width: number, height: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write("IHDR", 4);
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  // Enough filler to stand in for the rest of a real file.
  return Buffer.concat([signature, ihdr, Buffer.alloc(64 * 1024)]);
}

/** An ICO directory declaring three sizes, as a favicon.ico does. */
function ico(sizes: number[]): Buffer {
  const directory = Buffer.alloc(6 + 16 * sizes.length);
  directory.writeUInt16LE(0, 0);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(sizes.length, 4);
  sizes.forEach((size, index) => {
    directory.writeUInt8(size, 6 + 16 * index);
    directory.writeUInt8(size, 6 + 16 * index + 1);
  });
  return Buffer.concat([directory, Buffer.alloc(512)]);
}

describe("probeAsset", () => {
  let server: ServerType;
  let origin: string;

  beforeAll(async () => {
    const app = new Hono();

    // Deliberately 64 KB of filler after the header: the probe must come back
    // with the dimensions without having asked for the rest.
    app.get(
      "/card.png",
      () =>
        new Response(new Uint8Array(png(1200, 630)), {
          headers: { "content-type": "image/png" },
        }),
    );

    app.get(
      "/favicon.ico",
      () =>
        new Response(new Uint8Array(ico([16, 32, 48])), {
          headers: { "content-type": "image/x-icon" },
        }),
    );

    // The failure the whole rule exists for: a catch-all that answers the app
    // shell, with a 200, for a file it has never heard of.
    app.get(
      "/shell.png",
      () =>
        new Response("<!doctype html><html><body>Not found, but cheerfully</body></html>", {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
    );

    app.get("/gone.png", (c) => c.text("Not Found", 404));

    server = await new Promise((resolve) => {
      const s = serve({ fetch: app.fetch, port: 0 }, () => resolve(s));
    });
    const address = server.address();
    origin = `http://127.0.0.1:${typeof address === "string" ? 0 : address!.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("reads a PNG's dimensions out of its header", async () => {
    const probe = await probeAsset(`${origin}/card.png`);

    expect(probe.ok).toBe(true);
    expect(probe.status).toBe(200);
    expect(probe.sizes).toEqual([{ width: 1200, height: 630 }]);
  });

  it("reads every size an ICO container declares", async () => {
    // The half-true declaration `icons.sizes-mismatch` is written for is only
    // detectable because all three come back.
    const probe = await probeAsset(`${origin}/favicon.ico`);

    expect(probe.ok).toBe(true);
    expect(probe.sizes).toEqual([
      { width: 16, height: 16 },
      { width: 32, height: 32 },
      { width: 48, height: 48 },
    ]);
  });

  it("refuses a 200 of HTML", async () => {
    const probe = await probeAsset(`${origin}/shell.png`);

    expect(probe.status).toBe(200);
    expect(probe.ok).toBe(false);
    expect(probe.contentType).toBe("text/html");
    expect(probe.sizes).toBeUndefined();
  });

  it("reports a 404 without pretending it is a network failure", async () => {
    const probe = await probeAsset(`${origin}/gone.png`);

    expect(probe.status).toBe(404);
    expect(probe.ok).toBe(false);
  });

  it("collapses an unreachable host into status 0", async () => {
    const probe = await probeAsset("http://127.0.0.1:1/card.png", { timeoutMs: 1_000 });

    expect(probe.status).toBe(0);
    expect(probe.ok).toBe(false);
  });
});
