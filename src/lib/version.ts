/**
 * Single source of truth for the runtime-visible Headlint version.
 *
 * For now, hard-coded; Phase 11 swaps this for a reader of `package.json`.
 */
export const HEADLINT_VERSION = "0.0.0" as const;

export function isPreAlpha(version: string = HEADLINT_VERSION): boolean {
  return version.startsWith("0.");
}
