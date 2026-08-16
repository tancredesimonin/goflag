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
 *
 * `Uint8Array` and `DataView` rather than `Buffer`, so that claim holds all the
 * way into the type declarations: `Buffer` is a global `@types/node`
 * contributes, and a `.d.ts` naming it fails to compile for any consumer whose
 * tsconfig does not pull those types in — an error inside `node_modules`, in a
 * file they cannot edit. A `Buffer` is a `Uint8Array`, so callers who have one
 * pass it unchanged.
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
export function buildIco(entries: readonly IcoEntry[]): Uint8Array {
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

  const directoryBytes = HEADER_BYTES + ENTRY_BYTES * entries.length;
  const total = entries.reduce((sum, entry) => sum + entry.bytes.length, directoryBytes);
  const ico = new Uint8Array(total);
  const view = new DataView(ico.buffer);

  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // 1 = icon, 2 = cursor
  view.setUint16(4, entries.length, true);

  let offset = directoryBytes;
  entries.forEach(({ width, height = width, bytes }, index) => {
    const at = HEADER_BYTES + ENTRY_BYTES * index;
    view.setUint8(at, width >= 256 ? 0 : width);
    view.setUint8(at + 1, height >= 256 ? 0 : height);
    view.setUint8(at + 2, 0); // palette entries: 0 for true colour
    view.setUint8(at + 3, 0); // reserved
    view.setUint16(at + 4, 1, true); // colour planes
    view.setUint16(at + 6, 32, true); // bits per pixel
    view.setUint32(at + 8, bytes.length, true);
    view.setUint32(at + 12, offset, true);
    ico.set(bytes, offset);
    offset += bytes.length;
  });

  return ico;
}
