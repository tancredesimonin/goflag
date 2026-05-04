/**
 * Zod runtime schema for `headlint.config.{ts,js,mjs}`.
 *
 * Design notes:
 *
 *   - Every field is optional. The defaults live in
 *     `./defaults.ts` and are applied lazily by `resolveConfig()`,
 *     not by zod's `.default()`. We want the parsed config to
 *     reflect *exactly* what the user wrote, so the loader can warn
 *     about contradictions (e.g. `crawl: false` + `--crawl` on the
 *     CLI) without a phantom default getting in the way.
 *
 *   - Rule settings accept three shapes:
 *
 *         "off" | "warn" | "error"
 *         { severity: …, options?: { … } }
 *
 *     Options are intentionally untyped at the schema layer (they're
 *     `z.unknown()`), because each rule owns its own options
 *     contract. The rule registry in Phase 9.x will wire per-rule
 *     option schemas in if any rule actually needs them.
 *
 *   - `framework: "auto"` triggers detection from the user's
 *     `package.json`. We accept `"auto"` here as a sentinel; the
 *     resolver in `./detect.ts` rewrites it before the config leaves
 *     `resolveConfig`.
 *
 *   - Error messages favour pointing at the *path* of the bad
 *     field. Zod's default messages are decent, but we add a few
 *     custom ones where the failure mode is non-obvious (locale
 *     codes, glob lists).
 */

import { z } from "zod";

const SeverityEnum = z.enum(["off", "warn", "error", "info"]);

export const RuleSettingSchema = z.union([
  SeverityEnum,
  z.object({
    severity: SeverityEnum,
    options: z.record(z.string(), z.unknown()).optional(),
  }),
]);

const Bcp47Tag = z.string().regex(/^[a-z]{2,3}(-[A-Z]{2}|-\d{3})?$/, {
  message:
    "must be a basic BCP 47 tag like `en`, `fr`, `en-US` (case-sensitive). Script subtags are not supported in v1.",
});

const FrameworkEnum = z.enum([
  "auto",
  "next",
  "astro",
  "nuxt",
  "sveltekit",
  "remix",
  "vite-react",
  "unknown",
]);

export const I18nConfigSchema = z.object({
  locales: z.array(Bcp47Tag).min(1, { message: "at least one locale is required" }).optional(),
  defaultLocale: Bcp47Tag.optional(),
  /** When true, missing alternates are flagged as errors instead of warnings. */
  strictReciprocity: z.boolean().optional(),
});

export const CrawlConfigSchema = z.object({
  enabled: z.boolean().optional(),
  depth: z.number().int().min(0).max(10).optional(),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  concurrency: z.number().int().min(1).max(32).optional(),
  maxPages: z.number().int().min(1).max(10_000).optional(),
  followHreflang: z.boolean().optional(),
});

export const NormalizeRuleSchema = z.object({
  /** Glob applied to the JSON path of the field to normalise. */
  path: z.string().min(1),
  /** Replacement strategy. `"hash"` → SHA-1 first 8 chars,
   *  `"redact"` → empty string, `"strip"` → drop the field. */
  strategy: z.enum(["hash", "redact", "strip"]),
});

export const SnapshotConfigSchema = z.object({
  /** Directory (relative to CWD) for snapshot JSON files. */
  dir: z.string().min(1).optional(),
});

export const ConfigSchema = z.object({
  /** Base URL the CLI uses to resolve relative `inspect <path>` calls. */
  baseUrl: z.string().url({ message: "must be an absolute http(s) URL" }).optional(),
  framework: FrameworkEnum.optional(),
  i18n: I18nConfigSchema.optional(),
  crawl: CrawlConfigSchema.optional(),
  rules: z.record(z.string(), RuleSettingSchema).optional(),
  normalize: z.array(NormalizeRuleSchema).optional(),
  snapshot: SnapshotConfigSchema.optional(),
});

/**
 * Parse a raw `unknown` (typically the default export of a config
 * file) and return either the validated shape or a list of human
 * messages. We never throw out of here — the loader needs the
 * issues to format a single `headlint:` error block.
 */
export function parseConfig(
  raw: unknown,
): { ok: true; config: z.infer<typeof ConfigSchema> } | { ok: false; errors: string[] } {
  const result = ConfigSchema.safeParse(raw);
  if (result.success) return { ok: true, config: result.data };
  const errors = result.error.issues.map(formatIssue);
  return { ok: false, errors };
}

function formatIssue(issue: z.core.$ZodIssue): string {
  const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
  return `  • ${path}: ${issue.message}`;
}
