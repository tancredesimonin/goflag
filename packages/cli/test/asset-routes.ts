import type { Hono } from "hono";

/**
 * The files a fixture site declares, actually served.
 *
 * Two rule families reach for them. `icons.ico.missing` asks the origin's root
 * for a favicon, and the asset probe fetches every `og:image` and icon a page
 * declares — so without these routes every fixture site, including the ones
 * written to be flawless, reports defects it does not have, and a test asserting
 * "nothing is wrong here" asserts something false.
 *
 * The bytes are assembled rather than committed. A binary blob under
 * `fixtures/` would be one more file nobody can read in a diff, and these have
 * to be real files: the probe reads a PNG's IHDR and an ICO's directory, so a
 * placeholder that is not the format it claims would be caught — correctly.
 */
export function serveFavicon(app: Hono): void {
  const image = (body: Buffer, type: string) => () =>
    new Response(new Uint8Array(body), { headers: { "content-type": type } });

  app.get("/favicon.ico", image(ICO, "image/x-icon"));
  // 1200×630, the shape a preview card is expected to be, so `og.image.ratio`
  // has nothing to say about a fixture that is not about ratios.
  app.get("/og.png", image(pngHeader(1200, 630), "image/png"));
  app.get("/apple-icon.png", image(pngHeader(180, 180), "image/png"));
  app.get("/icon.svg", image(SVG, "image/svg+xml"));
}

/**
 * A PNG that is only a signature and an IHDR.
 *
 * Enough for the probe, which reads the dimensions at a fixed offset and never
 * decodes pixels — and honest about what it is, which a truncated real file
 * would not be.
 */
function pngHeader(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write("IHDR", 4);
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  return Buffer.concat([PNG_SIGNATURE, ihdr]);
}

const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16"/></svg>',
);

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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
