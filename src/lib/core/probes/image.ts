import sharp from "sharp";
import { combineSignals } from "./abort";

export interface ImageProbeOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ImageProbeResult {
  url: string;
  status: number;
  ok: boolean;
  contentType?: string;
  bytes?: number;
  width?: number;
  height?: number;
  format?: string;
  error?: string;
}

/**
 * Fetch an image and report its dimensions + filesize.
 *
 * Used sparingly — only by rules that genuinely need image dimensions
 * (e.g. `og.image.dimensions`). Sharp is a heavy native dep and we don't want
 * to call it for every page, so this is opt-in per-call rather than baked
 * into the static extractor.
 */
export async function probeImage(
  url: string,
  options: ImageProbeOptions = {},
): Promise<ImageProbeResult> {
  const { signal, cleanup } = combineSignals(options.signal, options.timeoutMs ?? 10_000);

  try {
    const res = await fetch(url, { signal, redirect: "follow" });
    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    if (!res.ok) {
      return { url, status: res.status, ok: false, contentType, error: `HTTP ${res.status}` };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    try {
      const metadata = await sharp(buf).metadata();
      return {
        url,
        status: res.status,
        ok: true,
        contentType,
        bytes: buf.byteLength,
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
      };
    } catch (err) {
      return {
        url,
        status: res.status,
        ok: false,
        contentType,
        bytes: buf.byteLength,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  } catch (err) {
    return { url, status: 0, ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    cleanup();
  }
}
