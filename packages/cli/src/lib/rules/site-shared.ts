/**
 * Two helpers the cross-page rules share across files.
 *
 * They lived in `./site-rules.ts` until the `llmstxt.*` rules needed them, and
 * those rules live in `./llms-txt.ts` because the registry already runs past
 * fifteen hundred lines. `site-rules.ts` imports `llms-txt.ts`, so the reverse
 * import would be circular; one small module both can read is the way out.
 */

/** How many offending entries a finding names before it starts counting. */
const SAMPLE = 5;

/** `n` entries, listing the first few — forty repeats of one defect is noise. */
export function sample(locs: string[]): string {
  const shown = locs.slice(0, SAMPLE);
  const rest = locs.length - shown.length;
  return `${shown.map((l) => `\`${l}\``).join(", ")}${rest > 0 ? `, and ${rest} more` : ""}`;
}

/** 4xx, 5xx, or no response at all. A 3xx is a redirect, not a death. */
export function isDead(status: number): boolean {
  return status === 0 || status >= 400;
}
