/**
 * Single source of truth for the runtime-visible Goflag version.
 *
 * For now, hard-coded; Phase 11 swaps this for a reader of `package.json`.
 */
export const GOFLAG_VERSION = "0.0.0" as const;

export function isPreAlpha(version: string = GOFLAG_VERSION): boolean {
  return version.startsWith("0.");
}
