/**
 * Headlint's "out of the box" defaults.
 *
 * These are applied by `resolveConfig()` *after* the user's config
 * file has been parsed. Keeping them out of the zod schema (no
 * `.default()`) means a saved or inspected config object always
 * reflects exactly what the user wrote — useful for the future
 * "Settings" UI panel.
 */

import type { HeadlintConfig } from "./types";

export const DEFAULT_CONFIG = {
  framework: "auto" as const,
  i18n: {
    strictReciprocity: false,
  },
  crawl: {
    enabled: false,
    depth: 1,
    include: [] as string[],
    exclude: [] as string[],
    concurrency: 4,
    maxPages: 200,
    followHreflang: true,
  },
  rules: {} as HeadlintConfig["rules"],
};
