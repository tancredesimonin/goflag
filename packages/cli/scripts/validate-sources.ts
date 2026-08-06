/**
 * Source catalog liveness check — the network half of the provenance
 * contract ("every URL resolves"). The offline half (unique ids, rigor
 * present, dates parse) runs as a unit test on every pipeline; this script
 * is wired to scheduled pipelines and to merge requests that touch the
 * catalog, because it depends on third-party servers and vendor URLs drift.
 *
 * Run it with `pnpm --filter @goflag/cli validate:sources`.
 *
 * Exit codes: 0 no citation has drifted, 1 at least one has (or the catalog
 * is structurally invalid — no point probing URLs of a broken catalog).
 *
 * "Drifted" is narrower than "did not answer". A host that is down or rate
 * limiting says nothing about whether the URL is still right, and failing a
 * merge on it would be blocking work on someone else's outage. Those are
 * reported and counted, not fatal; see `main()`.
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
  /**
   * The host was unavailable (429/5xx or a network error) rather than the URL
   * being wrong. Survives the retries so the caller can tell "this citation
   * has drifted" from "this check could not run".
   */
  transient: boolean;
  detail: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function probeOnce(id: string, url: string): Promise<ProbeResult> {
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

  // Two failures that look alike and mean opposite things. A 404 says the
  // document moved and the citation is now unverifiable — exactly the drift
  // this job exists to catch. A 503 after every retry says the host is down;
  // the URL is very likely fine, and "update the URL and its retrievedAt"
  // would be advice to change something that is not wrong.
  //
  // So only the definitive kind fails the job. The inconclusive kind is
  // reported with its count — a check that could not run must say so rather
  // than pass quietly, but it must not block a merge on someone else's
  // outage either.
  const dead = results.filter((result) => !result.ok && !result.transient);
  const inconclusive = results.filter((result) => !result.ok && result.transient);

  for (const result of results.sort((a, b) => a.id.localeCompare(b.id))) {
    const tag = result.ok ? "ok  " : result.transient ? "??  " : "FAIL";
    console.log(`${tag} ${result.id} — ${result.detail}`);
  }
  console.log(
    `\n${results.length - dead.length - inconclusive.length}/${results.length} sources resolve`,
  );

  if (inconclusive.length > 0) {
    console.warn(
      `\n${inconclusive.length} source(s) could not be reached — the host answered 429/5xx or ` +
        `refused the connection on every attempt. Not treated as drift:`,
    );
    for (const result of inconclusive) {
      console.warn(`  ${result.id}: ${result.url} — ${result.detail}`);
    }
  }

  if (dead.length > 0) {
    console.error("\nunreachable sources (update the URL and its retrievedAt):");
    for (const failure of dead) {
      console.error(`  ${failure.id}: ${failure.url} — ${failure.detail}`);
    }
    return 1;
  }
  return 0;
}

process.exitCode = await main();
