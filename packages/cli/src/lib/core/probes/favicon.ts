import type { FaviconProbe } from "../types";
import { combineSignals } from "./abort";

export interface FaviconProbeOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Ask the origin for `/favicon.ico`.
 *
 * `HEAD` first, because the answer is a status and a content type and the
 * bytes are nobody's business here; a `GET` follows when the server rejects
 * `HEAD`, which some do with 405 or 501. Nothing reads the body either way.
 *
 * **A 200 is not enough.** A site that serves its SPA shell for every unknown
 * path answers 200 with `text/html`, and treating that as an icon would make
 * this rule silently pass on exactly the sites it exists for. So the content
 * type has to say image — the same soft-404 reasoning the link checker
 * already applies to pages.
 */
export async function probeFavicon(
  origin: string,
  options: FaviconProbeOptions = {},
): Promise<FaviconProbe> {
  const url = new URL("/favicon.ico", origin).toString();
  const { signal, cleanup } = combineSignals(options.signal, options.timeoutMs ?? 5_000);

  try {
    let res = await fetch(url, { method: "HEAD", signal, redirect: "follow" });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { signal, redirect: "follow" });
    }

    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();

    return {
      url,
      status: res.status,
      found: res.ok && isIconType(contentType),
      contentType,
    };
  } catch {
    return { url, status: 0, found: false };
  } finally {
    cleanup();
  }
}

/**
 * Whether a content type names something a client would accept as an icon.
 *
 * `image/*` covers the honest answers, and the ICO type is spelled four
 * different ways in the wild — `image/x-icon` is what most servers send,
 * `image/vnd.microsoft.icon` is the registered one, and neither is guaranteed
 * to start with `image/` once a proxy has had an opinion.
 */
function isIconType(contentType: string | undefined): boolean {
  if (!contentType) return false;
  return (
    contentType.startsWith("image/") ||
    contentType === "application/ico" ||
    contentType === "application/x-ico"
  );
}
