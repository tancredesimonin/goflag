import type { Hono } from "hono";

/**
 * A `/favicon.ico` for the fixture servers.
 *
 * `icons.ico.missing` probes the origin's root, so without this every fixture
 * site — including the ones written to be flawless — reports it, and a test
 * asserting "nothing is wrong here" would be asserting something false about
 * a real defect. Serving one is what a correct site does; the fixtures should
 * look correct in the ways they are not the subject of.
 *
 * The bytes are assembled rather than committed: a 16×16 ICO wrapping a
 * one-pixel PNG, which is a valid container and about ninety bytes. A binary
 * blob in `fixtures/` would be one more file nobody can read in a diff.
 */
export function serveFavicon(app: Hono): void {
  app.get("/favicon.ico", () => {
    return new Response(new Uint8Array(ICO), {
      headers: { "content-type": "image/x-icon" },
    });
  });
}

/** A 1×1 transparent PNG — the smallest thing an ICO can legally contain. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/** ICONDIR + one ICONDIRENTRY + the image, per the ICO container layout. */
const ICO = (() => {
  const directory = Buffer.alloc(6 + 16);
  directory.writeUInt16LE(0, 0); // reserved
  directory.writeUInt16LE(1, 2); // 1 = icon
  directory.writeUInt16LE(1, 4); // one image
  directory.writeUInt8(16, 6); // width
  directory.writeUInt8(16, 7); // height
  directory.writeUInt16LE(1, 10); // colour planes
  directory.writeUInt16LE(32, 12); // bits per pixel
  directory.writeUInt32LE(PNG.length, 14);
  directory.writeUInt32LE(directory.length, 18);
  return Buffer.concat([directory, PNG]);
})();
