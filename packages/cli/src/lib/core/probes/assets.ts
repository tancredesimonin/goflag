/**
 * The asset probe — D8 of `docs/og-plan.md`.
 *
 * Three rules need to know what is actually served at a URL a page declared:
 * `og.image.reachable`, `icons.unreachable` and `icons.sizes-mismatch`. None of
 * them can find out for themselves, because a `Rule` is a pure synchronous
 * function of one `Extraction` and that purity is what makes the whole catalogue
 * testable without a network.
 *
 * So the network happens here, once per distinct URL, in a pass the report
 * orchestrator runs between the crawl and the lint; the answers are folded back
 * into the extraction as a side table the rules look up. The alternative
 * considered and rejected was widening the link auditor: an `og:image` is a
 * `<meta>`, never a link, so it would have had to grow a second input anyway —
 * and rules would have had to read a report section instead of their own model.
 *
 * **Only the head of the file is read.** A `Range` request asks for the first
 * few kilobytes, and a server that ignores it has its body cancelled after the
 * same number of bytes. Reachability needs a status; the intrinsic size needs a
 * header and no more. Downloading a 900 KB preview image to learn it is 1200
 * pixels wide would be a rude way to audit somebody's site.
 */

import type { AssetProbe, AssetSize } from "../types";
import { combineSignals } from "./abort";

export interface AssetProbeOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Enough for any header this decodes: a PNG states its size in the first 24
 * bytes, and an ICO directory is 6 + 16 bytes per image.
 */
const HEAD_BYTES = 8 * 1024;

/**
 * Whether a content type names something a client would render as an image.
 *
 * `image/*` covers the honest answers. ICO is spelled four ways in the wild —
 * `image/x-icon` is what most servers send and `image/vnd.microsoft.icon` is
 * the registered one — and neither is guaranteed to survive a proxy with
 * opinions, hence the two `application/` spellings.
 */
export function isImageContentType(contentType: string | undefined): boolean {
  if (!contentType) return false;
  return (
    contentType.startsWith("image/") ||
    contentType === "application/ico" ||
    contentType === "application/x-ico"
  );
}

/** Ask what is served at `url`, and read only its header. */
export async function probeAsset(
  url: string,
  options: AssetProbeOptions = {},
): Promise<AssetProbe> {
  const { signal, cleanup } = combineSignals(options.signal, options.timeoutMs ?? 8_000);

  try {
    const res = await fetch(url, {
      signal,
      redirect: "follow",
      headers: { range: `bytes=0-${HEAD_BYTES - 1}`, accept: "image/*,*/*;q=0.8" },
    });

    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    // 206 is the answer to the Range above; 200 means the server ignored it and
    // is sending the whole file, which `readHead` stops reading.
    const served = res.status === 200 || res.status === 206;
    const ok = served && isImageContentType(contentType);

    const head = served ? await readHead(res) : undefined;
    const sizes = head ? decodeSizes(head) : undefined;

    return { url, status: res.status, ok, contentType, ...(sizes ? { sizes } : {}) };
  } catch {
    return { url, status: 0, ok: false };
  } finally {
    cleanup();
  }
}

/** Read at most `HEAD_BYTES` from the body, then hang up. */
async function readHead(res: Response): Promise<Buffer | undefined> {
  if (!res.body) return undefined;

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (total < HEAD_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
      }
    }
  } catch {
    return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
  } finally {
    // The point of the whole exercise: stop the transfer rather than let the
    // rest of a preview image arrive for nothing.
    await reader.cancel().catch(() => undefined);
  }

  // Trimmed, not merely stopped. The loop above ends *after* the chunk that
  // crosses the threshold, so a server sending one large chunk hands back far
  // more than `HEAD_BYTES` — which made the JPEG walk's answer depend on how
  // the body happened to be framed on the wire. PNG and ICO never noticed,
  // their headers being at a fixed offset.
  return chunks.length > 0 ? Buffer.concat(chunks).subarray(0, HEAD_BYTES) : undefined;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * The intrinsic sizes a file declares about itself.
 *
 * PNG, ICO and JPEG. The first two are a fixed offset; the third is a marker
 * walk, and it was left out with a condition attached — "work to add the day a
 * site declares `sizes` on one". `og.image.sizes-mismatch` is that day: it
 * compares a declared `og:image:width`/`height` against the file, and a site
 * declaring those on a JPEG cover is the ordinary case rather than the exotic
 * one. Without the walk that rule answers `na` on exactly the file most worth
 * catching — stereo-house ships a 337-byte 1×1 placeholder declared 1200×630.
 *
 * SVG is still out, and for a different reason than effort: it frequently
 * declares no pixel size at all, so there is often nothing to read.
 *
 * Returning nothing for the rest stays the honest answer: a rule that receives
 * no size answers `na` instead of guessing.
 */
const JPEG_SOI = 0xffd8;

/**
 * The frame headers that carry a picture's dimensions.
 *
 * `SOF0`–`SOF15` minus the three markers that share the range and are not
 * frames at all: `C4` is a Huffman table, `C8` is reserved, `CC` is an
 * arithmetic-coding table. Reading a length out of one of those and calling it
 * a size is how a decoder returns confident nonsense.
 */
const JPEG_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

/**
 * Walk the segments to the first frame header.
 *
 * A JPEG states its size in a segment whose offset nothing declares: EXIF, ICC
 * profiles and thumbnails all sit in front of it, at whatever length they
 * please. So it is a walk — each segment is `FF <marker> <length:2>`, and the
 * length counts itself. Standalone markers carry no length, and `SOS` is where
 * entropy-coded data begins and the segment structure ends.
 *
 * Everything here gives up rather than guesses: a truncated header, a scan
 * reached before a frame, or a nonsensical length all return `undefined`.
 */
function decodeJpegSize(head: Buffer): AssetSize | undefined {
  let at = 2;

  while (at + 3 < head.length) {
    if (head[at] !== 0xff) return undefined;

    const marker = head[at + 1]!;
    // Fill bytes: any number of `FF` may pad the gap before a marker.
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    // Standalone: SOI, TEM and the eight restart markers carry no payload.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    // EOI, or the start of the scan. Either way there is no frame ahead.
    if (marker === 0xd9 || marker === 0xda) return undefined;

    const length = head.readUInt16BE(at + 2);
    if (length < 2) return undefined;

    if (JPEG_FRAME_MARKERS.has(marker)) {
      // `FF <marker> <length:2> <precision:1> <height:2> <width:2>`
      if (at + 9 > head.length) return undefined;
      return { width: head.readUInt16BE(at + 7), height: head.readUInt16BE(at + 5) };
    }

    at += 2 + length;
  }

  return undefined;
}

function decodeSizes(head: Buffer): AssetSize[] | undefined {
  if (head.length >= 24 && head.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return [{ width: head.readUInt32BE(16), height: head.readUInt32BE(20) }];
  }

  if (head.length >= 4 && head.readUInt16BE(0) === JPEG_SOI) {
    const size = decodeJpegSize(head);
    if (size) return [size];
    // Fell off the end of the header, or hit the scan first. Unknown, which is
    // not the same as a mismatch.
    return undefined;
  }

  // ICONDIR: reserved 0, type 1 (icon), then the image count.
  if (head.length >= 6 && head.readUInt16LE(0) === 0 && head.readUInt16LE(2) === 1) {
    const count = head.readUInt16LE(4);
    if (count === 0 || head.length < 6 + 16 * count) return undefined;

    const sizes: AssetSize[] = [];
    for (let index = 0; index < count; index++) {
      const at = 6 + 16 * index;
      // A zero byte means 256 — the format has one byte per dimension.
      sizes.push({ width: head[at] || 256, height: head[at + 1] || 256 });
    }
    return sizes;
  }

  return undefined;
}
