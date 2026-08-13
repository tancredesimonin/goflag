/**
 * The flag table, as a document a consumer outside this package can read.
 *
 * Same job and same shape as `../rules/catalog.ts`: `apps/**` cannot import
 * `packages/cli` (invariant I3), so the documentation site kept a hand copy of
 * thirty flags, their defaults and the exit codes — and a documentation audit
 * found four drifts in it. This is what stops the next one: the site reads the
 * generated `flags.json`, and its own file only carries the editorial prose a
 * reference page adds on top.
 *
 * `apply` is dropped on the way out. It is a function, it is the parser's
 * business, and it is the only field of `FlagSpec` a reader has no use for.
 */

import { EXIT_CODES, FLAGS, type FlagGroupId } from "./registry";

export interface FlagDoc {
  name: string;
  short: string | null;
  /** Argument placeholder (`<n>`), or null for a plain switch. */
  arg: string | null;
  /** Printed default, or null when the flag has none. */
  default: string | null;
  /** Another flag this one is meaningless without, or null. */
  requires: string | null;
  group: FlagGroupId;
  /**
   * The description exactly as `goflag --help` prints it, joined into one
   * paragraph. The terminal's line breaks are presentation, and a consumer
   * that lays the text out itself should not inherit them.
   */
  description: string;
}

export interface FlagCatalog {
  /** Present only when a caller asked for it; the file on disk carries none. */
  version?: string;
  flags: FlagDoc[];
  exitCodes: Array<{ code: number; label: string }>;
  counts: { flags: number; withShortForm: number; takingValue: number };
}

export function buildFlagCatalog(version?: string): FlagCatalog {
  const flags: FlagDoc[] = FLAGS.map((spec) => ({
    name: spec.name,
    short: spec.short ?? null,
    arg: spec.arg ?? null,
    default: spec.default ?? null,
    requires: spec.requires ?? null,
    group: spec.group,
    description: [...spec.help, ...(spec.dynamicTail?.() ?? [])].join(" "),
  }));

  // Ordered by name, so two versions of the file diff cleanly and a flag
  // added in the middle of the help does not move every line after it.
  flags.sort((a, b) => a.name.localeCompare(b.name));

  return {
    ...(version ? { version } : {}),
    flags,
    exitCodes: EXIT_CODES.map((e) => ({ code: e.code, label: e.label })),
    counts: {
      flags: flags.length,
      withShortForm: flags.filter((f) => f.short !== null).length,
      takingValue: flags.filter((f) => f.arg !== null).length,
    },
  };
}

/** The exact bytes `flags.json` must contain, so a comparison is a string one. */
export function serialiseFlags(catalog: FlagCatalog): string {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}
