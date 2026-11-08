/**
 * What structural coverage would audit on a site, measured without auditing it.
 *
 *   pnpm --filter @goflag/cli measure:coverage <url> [--locales a,b] [--out <file>]
 *
 * Reads the sitemap tree the way the CLI does — `discoverSitemap`, streamed —
 * and runs `selectByStructure` on it, then prints what it cost and what it
 * chose: URLs read, documents, bytes, seconds, heap at the peak, families, how
 * many pages the selection keeps and where they come from. **No page is
 * fetched**, only the sitemap documents, so it can be pointed at a large
 * third-party site without auditing it. `--out` writes the selected URLs, one
 * per line, so two runs can be compared for an identical sample.
 *
 * It exists for `docs/coverage-plan.md` §6.1 (`docs/integrations-plan.md` T-4):
 * the numbers there are this script's output, and this is the command that
 * reproduces them.
 */
import { writeFileSync } from "node:fs";

import { selectByStructure } from "../src/lib/core/coverage";
import { discoverSitemap } from "../src/lib/core/sitemap/discover";

function argValue(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
}

const url = process.argv[2];
if (!url || url.startsWith("--")) {
  process.stderr.write("usage: measure:coverage <url> [--locales a,b] [--out <file>]\n");
  process.exit(2);
}
const locales = (argValue("--locales") ?? "").split(",").filter(Boolean);
const out = argValue("--out");

let peak = 0;
const sample = () => {
  peak = Math.max(peak, process.memoryUsage().heapUsed);
};
const sampler = setInterval(sample, 20);
const before = process.memoryUsage().heapUsed;

const t0 = performance.now();
const discovery = await discoverSitemap(url, { crawlFallback: false, timeoutMs: 60_000 });
const t1 = performance.now();
const locs = discovery.urls.map((entry) => entry.loc);
const selection = selectByStructure(locs, { locales });
const t2 = performance.now();
clearInterval(sampler);
sample();

const sampled = selection.families.reduce((n, family) => n + family.sampled, 0);
const inFamilies = selection.families.reduce((n, family) => n + family.size, 0);
if (out) writeFileSync(out, `${selection.urls.join("\n")}\n`, "utf8");

process.stdout.write(
  `${JSON.stringify(
    {
      urls: locs.length,
      truncated: discovery.truncated,
      documents: discovery.documents.length,
      gzipped: discovery.documents.filter((doc) => doc.gzipped).length,
      bytes: discovery.documents.reduce((n, doc) => n + doc.byteLength, 0),
      discoverySeconds: Number(((t1 - t0) / 1000).toFixed(1)),
      selectionSeconds: Number(((t2 - t1) / 1000).toFixed(2)),
      peakHeapMB: Math.round((peak - before) / 1e6),
      rssMB: Math.round(process.memoryUsage().rss / 1e6),
      families: selection.families.length,
      inFamilies,
      selected: selection.urls.length,
      // Drawn from a family, and kept whole because their group is below the
      // threshold: the two halves of the selection, which grow differently.
      sampled,
      keptWhole: selection.urls.length - sampled,
      largestFamilies: selection.families
        .slice(0, 5)
        .map((family) => `${family.pattern} ${family.size}`),
    },
    null,
    2,
  )}\n`,
);
