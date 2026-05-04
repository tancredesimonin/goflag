/**
 * Public type surface for the Headlint configuration system.
 *
 * The runtime schema lives in `./schema.ts` (zod) — these types are
 * derived from that schema so the two never drift. This file exists
 * mainly so non-config code can `import type { HeadlintConfig }`
 * without dragging zod into its bundle.
 */

import type { z } from "zod";
import type { ConfigSchema, RuleSettingSchema } from "./schema";

export type HeadlintConfig = z.infer<typeof ConfigSchema>;
export type RuleSetting = z.infer<typeof RuleSettingSchema>;

export type Framework =
  | "next"
  | "astro"
  | "nuxt"
  | "sveltekit"
  | "remix"
  | "vite-react"
  | "unknown";
