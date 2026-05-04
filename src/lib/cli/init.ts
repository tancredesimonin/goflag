/**
 * `headlint init` — interactive scaffolder.
 *
 * Walks the user through a tiny set of prompts (using
 * `@clack/prompts`) and writes a starter `headlint.config.ts` to
 * the working directory. The generated file is intentionally short:
 * it sets the framework + base URL + an empty rules block, and
 * leaves long-form documentation in our website.
 *
 * The generated config is round-trip-safe: `loadConfig()` parses
 * it, applies defaults, and the result matches what the user typed.
 * The Phase 8 E2E test asserts this in a tmp dir.
 *
 * Non-interactive mode (`--yes`) skips every prompt and uses the
 * detected framework + the supplied base URL. Tests rely on this
 * path so they don't need to drive a TTY.
 */

import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as p from "@clack/prompts";

import type { Framework } from "../config";
import { detectFrameworkFromCwd } from "../config";

export interface RunInitOptions {
  cwd: string;
  /** Skip all prompts; use detected framework + the given baseUrl. */
  yes?: boolean;
  /** Default `baseUrl` when prompts are skipped. */
  baseUrl?: string;
  /** Override the detected framework. */
  framework?: Framework;
  /** Overwrite an existing config without confirmation. */
  force?: boolean;
}

export interface RunInitResult {
  ok: boolean;
  /** Path of the file we wrote (or would have written). */
  path: string;
  /** When ok=false, why. */
  reason?: "exists" | "cancelled" | "io-error";
  /** Captured error message for io-error. */
  message?: string;
}

const HEADLINT_TS_TEMPLATE = (params: { framework: Framework; baseUrl: string }): string => `/**
 * Headlint config — see https://headlint.dev/config for the full reference.
 *
 * Adding the (optional) type import once headlint is installed in
 * your project gives you autocompletion in this file:
 *
 *     import type { HeadlintConfig } from "headlint";
 *     const config: HeadlintConfig = { … };
 *     export default config;
 *
 * The plain-object form below works without any import and stays
 * portable across package managers.
 */
export default {
  baseUrl: ${JSON.stringify(params.baseUrl)},
  framework: ${JSON.stringify(params.framework)},

  // Per-route crawl. The i18n matrix + reciprocity findings only
  // populate when crawl.enabled is true (or when you pass
  // \`--crawl\` on the CLI).
  crawl: {
    enabled: false,
    depth: 1,
    include: [],
    exclude: [],
  },

  // Disable individual rules by id. Use "warn" or "error" to change
  // a rule's severity.
  rules: {
    // "title.length": "off",
    // "meta.description.present": "warn",
  },
};
`;

export async function runInit(options: RunInitOptions): Promise<RunInitResult> {
  const cwd = resolve(options.cwd);
  const target = resolve(cwd, "headlint.config.ts");

  if (existsSync(target) && !options.force) {
    if (!options.yes) {
      const overwrite = await p.confirm({
        message: `\`headlint.config.ts\` already exists. Overwrite?`,
        initialValue: false,
      });
      if (p.isCancel(overwrite) || overwrite === false) {
        return { ok: false, path: target, reason: "cancelled" };
      }
    } else {
      return { ok: false, path: target, reason: "exists" };
    }
  }

  const detected = options.framework ?? detectFrameworkFromCwd(cwd);
  let framework = detected;
  let baseUrl = options.baseUrl ?? "https://example.com";

  if (!options.yes) {
    p.intro("Headlint setup");
    const url = await p.text({
      message: "What's the base URL of the site you want to lint?",
      placeholder: "https://example.com",
      defaultValue: baseUrl,
      validate: (v) => {
        if (typeof v !== "string" || v.length === 0) return "Required";
        try {
          new URL(v);
          return undefined;
        } catch {
          return "Must be an absolute URL (https://…)";
        }
      },
    });
    if (p.isCancel(url)) return { ok: false, path: target, reason: "cancelled" };
    baseUrl = String(url);

    const fw = await p.select({
      message: `Framework? (detected: ${detected})`,
      options: (
        ["next", "astro", "nuxt", "sveltekit", "remix", "vite-react", "unknown"] as Framework[]
      ).map((f) => ({ value: f, label: f })),
      initialValue: detected,
    });
    if (p.isCancel(fw)) return { ok: false, path: target, reason: "cancelled" };
    framework = fw as Framework;

    p.outro(`Writing ${shortPath(cwd, target)}…`);
  }

  try {
    writeFileSync(target, HEADLINT_TS_TEMPLATE({ framework, baseUrl }), "utf8");
  } catch (err) {
    return {
      ok: false,
      path: target,
      reason: "io-error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
  return { ok: true, path: target };
}

function shortPath(cwd: string, file: string): string {
  if (file.startsWith(cwd + "/")) return file.slice(cwd.length + 1);
  return file;
}
