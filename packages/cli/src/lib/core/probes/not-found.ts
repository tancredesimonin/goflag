import { randomBytes } from "node:crypto";

import type { NotFoundProbe } from "../types";
import { combineSignals } from "./abort";

export interface NotFoundProbeOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /**
   * The random part of the invented paths. Tests pin it; a run never should —
   * a fixed nonce is a route someone can add, and then the probe passes on a
   * site that serves a page for every other unknown path.
   */
  nonce?: string;
}

/**
 * Ask the origin for two paths it cannot have, and record what it answers.
 *
 * Every other check in goflag asks for URLs the site published — a link, a
 * sitemap entry, `/favicon.ico` — so none of them can see how the site treats
 * a URL nobody published. That is where a catch-all route hides: measured on
 * 2026-10-05, openfinanceguide.com answered `/llms.txt`, `/feed.xml` and any
 * invented `.txt` with its home page and a 200, because its i18n middleware
 * matcher skips dotted paths and the `[locale]` segment never checked the
 * locale. Its develop environment answered the same paths with a 500.
 *
 * Two shapes, because that defect only shows on one of them: `/<nonce>` goes
 * through the middleware (redirect to `/en/<nonce>`, then 404 — correct) and
 * `/<nonce>.txt` does not. The nonce is 128 random bits, fresh per run: no
 * site routes it, and nothing downstream may fingerprint on it.
 *
 * `HEAD` first, a `GET` when the server rejects `HEAD` — the favicon probe's
 * pattern. Then one more step that probe does not need: an answer other than
 * 404 or 410 is asked again with `GET` before it is believed, because it is the
 * answer that becomes an `error`, and a proxy that answers `HEAD` without
 * consulting the route is not the site's catch-all. The link checker re-asks a
 * `HEAD` 2xx with `GET` for the same reason.
 */
export async function probeNotFound(
  origin: string,
  options: NotFoundProbeOptions = {},
): Promise<NotFoundProbe[]> {
  const nonce = options.nonce ?? randomBytes(16).toString("hex");
  const base = `/goflag-probe-${nonce}`;
  return Promise.all([
    ask(new URL(base, origin).toString(), "bare", options),
    ask(new URL(`${base}.txt`, origin).toString(), "dotted", options),
  ]);
}

async function ask(
  url: string,
  shape: NotFoundProbe["shape"],
  options: NotFoundProbeOptions,
): Promise<NotFoundProbe> {
  const { signal, cleanup } = combineSignals(options.signal, options.timeoutMs ?? 5_000);

  try {
    let res = await fetch(url, { method: "HEAD", signal, redirect: "follow" });
    if (!isNotFound(res.status)) {
      res = await fetch(url, { signal, redirect: "follow" });
      // Nothing reads the body; releasing it frees the socket now rather
      // than whenever the collector gets to it.
      await res.body?.cancel().catch(() => undefined);
    }

    return {
      url,
      shape,
      status: res.status,
      finalUrl: res.url || url,
      contentType:
        res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() || undefined,
    };
  } catch {
    return { url, shape, status: 0, finalUrl: url };
  } finally {
    cleanup();
  }
}

/** RFC 9110 §15.5.5 and §15.5.11: the two answers that mean "nothing here". */
export function isNotFound(status: number): boolean {
  return status === 404 || status === 410;
}
