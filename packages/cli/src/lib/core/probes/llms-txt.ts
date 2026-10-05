import { looksLikeHtml, parseLlmsTxt } from "../llmstxt/parse";
import type { LlmsTxtProbe } from "../types";
import { combineSignals } from "./abort";

export interface LlmsTxtProbeOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Fetch and read the origin's `/llms.txt`.
 *
 * Optional by design: the proposal (https://llmstxt.org) asks nobody to publish
 * one, and Lighthouse's own audit marks a 404 "Not Applicable". So an absent
 * file is `found: false` and every rule about it stays silent.
 *
 * A 200 is not taken at its word either. The body is checked for an HTML
 * document before anything parses it as markdown, because the site this was
 * written for answered `/llms.txt` with its home page — and reading that as an
 * llms.txt would report a missing H1 and every navigation link as a listed URL.
 */
export async function probeLlmsTxt(
  origin: string,
  options: LlmsTxtProbeOptions = {},
): Promise<LlmsTxtProbe> {
  const url = new URL("/llms.txt", origin).toString();
  const { signal, cleanup } = combineSignals(options.signal, options.timeoutMs ?? 5_000);
  const nothing = { found: false, html: false, links: [] };

  try {
    const res = await fetch(url, { signal, redirect: "follow" });
    const finalUrl = res.url || url;
    const contentType =
      res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() || undefined;

    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return { url, status: res.status, finalUrl, contentType, ...nothing };
    }

    const body = await res.text();
    if (looksLikeHtml(body)) {
      return { url, status: res.status, finalUrl, contentType, found: true, html: true, links: [] };
    }

    return {
      url,
      status: res.status,
      finalUrl,
      contentType,
      found: true,
      html: false,
      ...parseLlmsTxt(body, finalUrl),
    };
  } catch {
    return { url, status: 0, finalUrl: url, ...nothing };
  } finally {
    cleanup();
  }
}
