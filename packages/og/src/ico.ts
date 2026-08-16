/**
 * The ICO container — the one output Next has no convention for.
 *
 * `docs/og-plan.md` §6.4, D6. `favicon.ico` is a static file and `icon.tsx`
 * goes through `ImageResponse`, which emits PNG; nothing in the chain assembles
 * an ICO. So four sites wrote the same forty lines of `Buffer` arithmetic, and
 * this is those forty lines, once.
 *
 * It rasterises nothing, by decision rather than by omission. Packing
 * already-encoded images is pure byte manipulation with no dependency; the
 * moment this file knew what `sharp` was, the package would carry a native
 * binary for every consumer. The site rasterises with the `sharp` it already
 * has for Next's image optimisation, exactly as it supplies its own fonts.
 */

/** One image inside the container. `bytes` is an already-encoded PNG. */
export interface IcoEntry {
  /** 1–256. Anything else is a container no shell will read. */
  readonly width: number;
  /** Defaults to `width`: every icon these sites ship is square. */
  readonly height?: number;
  readonly bytes: Uint8Array;
}

const HEADER_BYTES = 6;
const ENTRY_BYTES = 16;

/**
 * Pack encoded PNGs into an ICO.
 *
 * Layout: a 6-byte `ICONDIR`, one 16-byte `ICONDIRENTRY` per image, then the
 * image data. A dimension of 256 is written as `0`, which is how a
 * single-byte field says 256.
 */
export function buildIco(entries: readonly IcoEntry[]): Buffer {
  if (entries.length === 0) {
    throw new Error("buildIco: an ICO with no image in it is not a file any shell will read.");
  }

  for (const { width, height = width } of entries) {
    for (const side of [width, height]) {
      if (!Number.isInteger(side) || side < 1 || side > 256) {
        throw new Error(`buildIco: ${side} is not a dimension an ICO entry can carry (1–256).`);
      }
    }
  }

  const directory = Buffer.alloc(HEADER_BYTES + ENTRY_BYTES * entries.length);
  directory.writeUInt16LE(0, 0); // reserved
  directory.writeUInt16LE(1, 2); // 1 = icon, 2 = cursor
  directory.writeUInt16LE(entries.length, 4);

  let offset = directory.length;
  entries.forEach(({ width, height = width, bytes }, index) => {
    const at = HEADER_BYTES + ENTRY_BYTES * index;
    directory.writeUInt8(width >= 256 ? 0 : width, at);
    directory.writeUInt8(height >= 256 ? 0 : height, at + 1);
    directory.writeUInt8(0, at + 2); // palette entries: 0 for true colour
    directory.writeUInt8(0, at + 3); // reserved
    directory.writeUInt16LE(1, at + 4); // colour planes
    directory.writeUInt16LE(32, at + 6); // bits per pixel
    directory.writeUInt32LE(bytes.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += bytes.length;
  });

  return Buffer.concat([directory, ...entries.map((entry) => Buffer.from(entry.bytes))]);
}

/**
 * The dimensions a container actually holds — `buildIco` read backwards.
 *
 * Written for the declaration that is half true: `tancrede` declares
 * `{ url: "/favicon.ico", sizes: "48x48" }` while the file carries 16, 32 **and**
 * 48. A site that reads its own container cannot make that claim by hand, which
 * is the same defect `icons.sizes-mismatch` reports from the outside.
 */
export function readIcoSizes(bytes: Uint8Array): { width: number; height: number }[] {
  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.length < HEADER_BYTES || view.readUInt16LE(2) !== 1) {
    throw new Error("readIcoSizes: not an ICO container.");
  }

  const count = view.readUInt16LE(4);
  if (view.length < HEADER_BYTES + ENTRY_BYTES * count) {
    throw new Error("readIcoSizes: the directory claims more entries than the file holds.");
  }

  return Array.from({ length: count }, (_unused, index) => {
    const at = HEADER_BYTES + ENTRY_BYTES * index;
    // 0 means 256 in a byte-wide field, in both directions.
    return { width: view.readUInt8(at) || 256, height: view.readUInt8(at + 1) || 256 };
  });
}
