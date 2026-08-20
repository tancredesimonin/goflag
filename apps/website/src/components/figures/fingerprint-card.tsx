import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cn } from "@/lib/utils";

/**
 * What a finding's identity is made of — with the ids computed, not asserted.
 *
 * `ci/baseline.mdx` explains the scheme in two paragraphs and one exception,
 * and the reader has to take all of it on trust: nothing on the page lets them
 * check that the same metadata finding really does survive a change of origin,
 * or that a broken link really does not. It is the first cause of "my baseline
 * reddened and nothing moved", and the reason the merge-request job works.
 *
 * The numbers come from `packages/cli/scripts/fingerprint-fixture.ts`, which
 * calls `fingerprint`, `routeKey` and `targetKey` — the engine's own functions,
 * with the arguments `build.ts` passes. This app cannot call them (invariant
 * I3), so it reads the generated file by relative path, the same way it reads
 * the transcripts and `rules.json`.
 *
 * An id written by hand here would be a number a reader would be right not to
 * believe, and one that nothing would ever correct.
 */

export interface FingerprintCase {
  finding: string;
  parts: readonly string[];
  ids: Readonly<Record<string, string>>;
  stable: boolean;
  why: string;
}

interface FingerprintFixture {
  origins: readonly string[];
  page: string;
  target: string;
  cases: readonly FingerprintCase[];
}

export const FINGERPRINTS: FingerprintFixture = JSON.parse(
  readFileSync(
    join(
      process.cwd(),
      "..",
      "..",
      "packages",
      "cli",
      "test",
      "fixtures",
      "transcripts",
      "fingerprints.json",
    ),
    "utf8",
  ),
);

export function FingerprintCard() {
  return (
    <figure className="not-prose border-border my-8 rounded-lg border p-4 sm:p-6">
      <figcaption className="text-muted-foreground mb-5 text-sm">
        The same two findings, fingerprinted from two origins. The ids below are computed by the
        engine&rsquo;s own functions when this page is built — not written down.
      </figcaption>

      <div className="flex flex-col gap-4">
        {FINGERPRINTS.cases.map((item) => {
          const ids = Object.entries(item.ids);
          return (
            <div
              key={item.finding}
              className={cn(
                "rounded border-l-2 p-3 sm:p-4",
                item.stable
                  ? "border-flag-green/60 bg-flag-green/5"
                  : "border-flag-yellow/60 bg-flag-yellow/5",
              )}
            >
              <p className="mb-1 text-sm font-medium">{item.finding}</p>
              <p className="text-muted-foreground mb-3 font-mono text-xs">
                fingerprint({item.parts.join(", ")})
              </p>

              <dl className="mb-3 flex flex-col gap-1">
                {ids.map(([origin, id]) => (
                  <div key={origin} className="flex flex-wrap items-baseline gap-x-3 font-mono">
                    <dt className="text-muted-foreground min-w-[13rem] text-xs">{origin}</dt>
                    <dd
                      className={cn(
                        "text-xs font-medium",
                        item.stable ? "text-flag-green" : "text-flag-yellow",
                      )}
                    >
                      {id}
                    </dd>
                  </div>
                ))}
              </dl>

              <p className="text-sm">
                <span
                  className={cn(
                    "font-mono text-xs font-semibold",
                    item.stable ? "text-flag-green" : "text-flag-yellow",
                  )}
                >
                  {item.stable ? "same id" : "two ids"}
                </span>
                <span className="text-muted-foreground"> — {item.why}</span>
              </p>
            </div>
          );
        })}
      </div>
    </figure>
  );
}
