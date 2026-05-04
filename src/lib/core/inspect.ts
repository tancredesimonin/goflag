import type { Page } from "./types";
import { extractStatic } from "./extract/static";
import { fetchStatic, type FetchStaticOptions } from "./fetch/static";
import { probeManifest } from "./probes/manifest";
import { probeRobots } from "./probes/robots";
import { probeSitemap } from "./probes/sitemap";

export interface InspectOptions extends FetchStaticOptions {
  /**
   * Whether to fetch `/robots.txt`, `/sitemap.xml`, and the linked manifest.
   * Defaults to `true`. Disable in tests that only care about the HTML.
   */
  probes?: boolean;
}

/**
 * High-level orchestrator: fetch the URL, parse the HTML, run the
 * side-channel probes, and stitch everything into a complete `Page`.
 *
 * This is the single entry point shared by the CLI (`headlint inspect`),
 * the UI Server Action (Phase 3), and the snapshot/diff layers (Phases 9+).
 * Keeping it thin and pure means we never have to maintain two divergent
 * code paths between local UI and CI.
 */
export async function inspect(url: string, options: InspectOptions = {}): Promise<Page> {
  const { probes: enableProbes = true, ...fetchOptions } = options;

  const fetchedAt = new Date().toISOString();
  const { meta: fetchMeta, body } = await fetchStatic(url, fetchOptions);
  const parsed = extractStatic(body, { baseUrl: fetchMeta.finalUrl });

  const probes: Page["probes"] = {};
  if (enableProbes) {
    const origin = new URL(fetchMeta.finalUrl).origin;
    const [robots, sitemap, manifest] = await Promise.all([
      probeRobots(origin, { signal: fetchOptions.signal }),
      probeSitemap(origin, { signal: fetchOptions.signal }),
      parsed.links.manifest
        ? probeManifest(parsed.links.manifest.href, { signal: fetchOptions.signal })
        : Promise.resolve(undefined),
    ]);
    probes.robots = robots;
    probes.sitemap = sitemap;
    if (manifest) probes.manifest = manifest;
  }

  return {
    ...parsed,
    fetchedAt,
    fetch: fetchMeta,
    probes,
  };
}
