import type { RobotsProbe } from "../types";
import { combineSignals } from "./abort";

export interface RobotsProbeOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function probeRobots(
  origin: string,
  options: RobotsProbeOptions = {},
): Promise<RobotsProbe> {
  const url = new URL("/robots.txt", origin).toString();
  const { signal, cleanup } = combineSignals(options.signal, options.timeoutMs ?? 5_000);

  try {
    const res = await fetch(url, { signal, redirect: "follow" });
    if (!res.ok) {
      return { url, status: res.status, found: false, sitemaps: [], blocksAll: false };
    }
    const body = await res.text();
    return {
      url,
      status: res.status,
      found: true,
      raw: body,
      sitemaps: extractSitemaps(body),
      blocksAll: blocksAllUserAgents(body),
    };
  } catch {
    return { url, status: 0, found: false, sitemaps: [], blocksAll: false };
  } finally {
    cleanup();
  }
}

export function extractSitemaps(body: string): string[] {
  const out: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const m = /^\s*Sitemap:\s*(\S+)\s*$/i.exec(line);
    if (m?.[1]) out.push(m[1]);
  }
  return out;
}

/**
 * Detect whether the file disallows everything for `User-agent: *`.
 * Walks line-by-line, tracking the active group; returns true the moment we
 * see `Disallow: /` (with no path beyond `/`) inside a `*` group.
 */
export function blocksAllUserAgents(body: string): boolean {
  let inWildcard = false;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (line.length === 0) continue;
    const ua = /^User-agent:\s*(.+)$/i.exec(line);
    if (ua) {
      inWildcard = ua[1]!.trim() === "*";
      continue;
    }
    if (!inWildcard) continue;
    const dis = /^Disallow:\s*(.*)$/i.exec(line);
    if (dis && dis[1]!.trim() === "/") return true;
  }
  return false;
}
