/**
 * Source catalog liveness check — the network half of the provenance
 * contract ("every URL resolves"). The offline half (unique ids, rigor
 * present, dates parse) runs as a unit test on every pipeline; this script
 * is wired to scheduled pipelines and to merge requests that touch the
 * catalog, because it depends on third-party servers and vendor URLs drift.
 *
 * Run it with `pnpm --filter @goflag/cli validate:sources`.
 *
 * Exit codes: 0 every URL resolves, 1 at least one does not (or the catalog
 * is structurally invalid — no point probing URLs of a broken catalog).
 */

import { SOURCES } from "../src/lib/rules/sources/index";
import { validateSourceCatalog } from "../src/lib/rules/sources/validate";

const CONCURRENCY = 6;
const TIMEOUT_MS = 20_000;

// An honest UA, verified against every host in the catalog. Counter-
// intuitively, honesty is also what works: w3.org and developers.facebook.com
// run bot mitigation that rejects a *browser-shaped* UA coming from a
// non-browser TLS stack (403/400), while a tool that identifies itself
// passes.
const USER_AGENT = "goflag-source-validator/0.1 (+https://goflag.tech)";

// 5xx and 429 are the host having a moment, not the URL having drifted —
// validator.w3.org in particular rate-limits. Network errors get the same
// benefit of the doubt.
const RETRIES = 2;
const RETRY_DELAY_MS = 3_000;

interface ProbeResult {
  id: string;
  url: string;
  ok: boolean;
  detail: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function probeOnce(id: string, url: string): Promise<ProbeResult & { transient: boolean }> {
  try {
    // GET rather than HEAD: several of these hosts answer HEAD with 403/405.
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" },
    });
    return {
      id,
      url,
      ok: response.ok,
      transient: response.status === 429 || response.status >= 500,
      detail: `${response.status}${response.redirected ? ` (redirected to ${response.url})` : ""}`,
    };
  } catch (err) {
    return {
      id,
      url,
      ok: false,
      transient: true,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function probe(id: string, url: string): Promise<ProbeResult> {
  let result = await probeOnce(id, url);
  for (let attempt = 0; !result.ok && result.transient && attempt < RETRIES; attempt++) {
    await sleep(RETRY_DELAY_MS * (attempt + 1));
    result = await probeOnce(id, url);
  }
  return result;
}

async function main(): Promise<number> {
  const structural = validateSourceCatalog(SOURCES);
  if (structural.length > 0) {
    console.error("source catalog is structurally invalid; not probing URLs:");
    for (const error of structural) console.error(`  ${error.sourceId}: ${error.message}`);
    return 1;
  }

  const queue = SOURCES.map((source) => ({ id: source.id, url: source.url }));
  const results: ProbeResult[] = [];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        results.push(await probe(next.id, next.url));
      }
    }),
  );

  const failures = results.filter((result) => !result.ok);
  for (const result of results.sort((a, b) => a.id.localeCompare(b.id))) {
    console.log(`${result.ok ? "ok  " : "FAIL"} ${result.id} — ${result.detail}`);
  }
  console.log(`\n${results.length - failures.length}/${results.length} sources resolve`);

  if (failures.length > 0) {
    console.error("\nunreachable sources (update the URL and its retrievedAt):");
    for (const failure of failures)
      console.error(`  ${failure.id}: ${failure.url} — ${failure.detail}`);
    return 1;
  }
  return 0;
}

process.exitCode = await main();
