import type { ManifestProbe } from "../types";
import { combineSignals } from "./abort";

export interface ManifestProbeOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Fetch a `<link rel="manifest" href>` payload and try to parse it as JSON.
 * Returns a `ManifestProbe` with `found: false` for any non-2xx response or
 * network error; `parseError` is set if the body isn't valid JSON.
 */
export async function probeManifest(
  href: string,
  options: ManifestProbeOptions = {},
): Promise<ManifestProbe> {
  const { signal, cleanup } = combineSignals(options.signal, options.timeoutMs ?? 5_000);
  try {
    const res = await fetch(href, { signal, redirect: "follow" });
    if (!res.ok) return { url: href, status: res.status, found: false };
    const raw = await res.text();
    let data: unknown;
    let parseError: string | undefined;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
    }
    return { url: href, status: res.status, found: true, raw, data, parseError };
  } catch {
    return { url: href, status: 0, found: false };
  } finally {
    cleanup();
  }
}
