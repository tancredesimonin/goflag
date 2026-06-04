/**
 * The `defineConfig()` user-facing helper.
 *
 * It's an identity function — its only job is to give the user
 * type-checking and IntelliSense in their `goflag.config.ts`. The
 * real validation happens in `loadConfig()` via zod, because the
 * config file might also be plain JS or written without invoking
 * `defineConfig` at all.
 */

import type { GoflagConfig } from "./types";

export function defineConfig(config: GoflagConfig): GoflagConfig {
  return config;
}
