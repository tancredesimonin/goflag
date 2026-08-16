import { describe, expect, it } from "vitest";

import { buildIco, readIcoSizes } from "./ico.js";

/** Not a real PNG: `buildIco` packs bytes and never looks inside them. */
const png = (fill: number, length = 8) => new Uint8Array(length).fill(fill);

/** The container reads little-endian, so the assertions do too. */
const read = (ico: Uint8Array) => new DataView(ico.buffer, ico.byteOffset, ico.byteLength);
const u8 = (ico: Uint8Array, at: number) => read(ico).getUint8(at);
const u16 = (ico: Uint8Array, at: number) => read(ico).getUint16(at, true);
const u32 = (ico: Uint8Array, at: number) => read(ico).getUint32(at, true);

describe("buildIco", () => {
  it("writes the header a shell reads: reserved, type 1, and the count", () => {
    const ico = buildIco([{ width: 16, bytes: png(1) }]);

    expect(u16(ico, 0)).toBe(0);
    expect(u16(ico, 2)).toBe(1);
    expect(u16(ico, 4)).toBe(1);
  });

  it("points each entry at its own bytes, in order", () => {
    const entries = [
      { width: 16, bytes: png(0xaa, 8) },
      { width: 32, bytes: png(0xbb, 12) },
      { width: 48, bytes: png(0xcc, 5) },
    ];
    const ico = buildIco(entries);

    let expected = 6 + 16 * entries.length;
    entries.forEach((entry, index) => {
      const at = 6 + 16 * index;
      expect(u32(ico, at + 8)).toBe(entry.bytes.length);
      expect(u32(ico, at + 12)).toBe(expected);
      expect([...ico.subarray(expected, expected + entry.bytes.length)]).toEqual([...entry.bytes]);
      expected += entry.bytes.length;
    });

    expect(ico.length).toBe(expected);
  });

  it("writes 256 as 0, which is how a byte-wide field says 256", () => {
    const ico = buildIco([{ width: 256, bytes: png(1) }]);

    expect(u8(ico, 6)).toBe(0);
    expect(u8(ico, 7)).toBe(0);
  });

  it("carries a non-square entry rather than assuming the width twice", () => {
    const ico = buildIco([{ width: 32, height: 16, bytes: png(1) }]);

    expect(u8(ico, 6)).toBe(32);
    expect(u8(ico, 7)).toBe(16);
  });

  it("refuses an empty container", () => {
    expect(() => buildIco([])).toThrow(/no image/);
  });

  it.each([0, 257, 16.5])("refuses %s as a dimension", (width) => {
    expect(() => buildIco([{ width, bytes: png(1) }])).toThrow(/1–256/);
  });
});

describe("readIcoSizes", () => {
  it("reads back what buildIco wrote", () => {
    const ico = buildIco([
      { width: 16, bytes: png(1) },
      { width: 32, bytes: png(2) },
      { width: 48, bytes: png(3) },
    ]);

    expect(readIcoSizes(ico)).toEqual([
      { width: 16, height: 16 },
      { width: 32, height: 32 },
      { width: 48, height: 48 },
    ]);
  });

  it("reads 0 back as 256", () => {
    expect(readIcoSizes(buildIco([{ width: 256, bytes: png(1) }]))).toEqual([
      { width: 256, height: 256 },
    ]);
  });

  it("says so when the bytes are not an ICO", () => {
    expect(() => readIcoSizes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]))).toThrow(
      /not an ICO/,
    );
  });

  it("says so when the directory claims more entries than the file holds", () => {
    const truncated = buildIco([{ width: 16, bytes: png(1) }]).subarray(0, 10);

    expect(() => readIcoSizes(truncated)).toThrow(/more entries/);
  });
});
