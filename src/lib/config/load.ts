/**
 * Headlint config loader.
 *
 * Walks up from `cwd` looking for `headlint.config.{ts,mts,js,mjs,cjs}`,
 * dynamically imports the module, validates the default export
 * against the zod schema, applies defaults + framework detection,
 * and returns the resolved config plus the path it loaded from.
 *
 * TypeScript files are imported via `tsx/esm/api`'s `tsImport`,
 * which evaluates the file in a temporary loader scope. We do not
 * register the loader globally — that would shadow the user's own
 * tsx setup and cause subtle ordering bugs.
 *
 * Failure modes:
 *
 *   - File not found within 6 ancestor levels → returns
 *     `{ ok: true, source: "default" }` with the empty user config.
 *     This is the "no config" path, not an error: most users start
 *     without one.
 *   - Module imported, but no default export → `ok: false` with a
 *     helpful pointer at the file path.
 *   - Default export fails zod validation → `ok: false` with the
 *     formatted issue list.
 *   - Module throws during import → `ok: false` with the underlying
 *     error message.
 */

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { tsImport } from "tsx/esm/api";

import { detectFrameworkFromCwd } from "./detect";
import { DEFAULT_CONFIG } from "./defaults";
import { parseConfig } from "./schema";
import type { HeadlintConfig } from "./types";

const FILENAMES = [
  "headlint.config.ts",
  "headlint.config.mts",
  "headlint.config.mjs",
  "headlint.config.js",
  "headlint.config.cjs",
];

export type LoadConfigSource = "file" | "default";

export type LoadConfigResult =
  | {
      ok: true;
      /** Fully resolved config with defaults + framework detection applied. */
      config: HeadlintConfig;
      /** Raw user config exactly as it appeared in the file (or `{}` for default). */
      raw: HeadlintConfig;
      /** Where the config came from. `"default"` when no file was found. */
      source: LoadConfigSource;
      /** Absolute path of the file that was loaded, if any. */
      filepath?: string;
    }
  | {
      ok: false;
      /** Path of the offending file when the failure was a parse / import error. */
      filepath?: string;
      /** Human messages, one per line, suitable for the CLI to print. */
      errors: string[];
    };

export interface LoadConfigOptions {
  /** Directory to start the walk from. Defaults to `process.cwd()`. */
  cwd?: string;
  /**
   * Explicit config file path. When provided, the loader skips the
   * upward walk and loads exactly this file (still validates).
   */
  file?: string;
}

export async function loadConfig(options: LoadConfigOptions = {}): Promise<LoadConfigResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const filepath = options.file ? resolve(options.file) : findConfigFile(cwd);

  if (!filepath) {
    return {
      ok: true,
      config: applyDefaults({}, cwd),
      raw: {},
      source: "default",
    };
  }

  let mod: { default?: unknown };
  try {
    mod = await importConfig(filepath);
  } catch (err) {
    return {
      ok: false,
      filepath,
      errors: [
        `Failed to import ${rel(cwd, filepath)}: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }

  // tsx's `tsImport` wraps the user module: it returns
  // `{ default: <namespace> }` where `<namespace>` carries every
  // named export and a `default` slot for `export default`. Plain
  // ESM / CJS `import()` returns the namespace at the top level.
  // We unify both via an `unwrap` step that always reads the user's
  // *actual* default export and surfaces "no default" as an error
  // instead of silently treating the named-export namespace as the
  // config (which would slip past zod because every field is
  // optional).
  const exported = unwrapDefaultExport(mod);
  if (exported === undefined || typeof exported !== "object" || exported === null) {
    return {
      ok: false,
      filepath,
      errors: [
        `${rel(cwd, filepath)} must export a default object (use \`export default defineConfig({ … })\`).`,
      ],
    };
  }

  const parsed = parseConfig(exported);
  if (!parsed.ok) {
    return {
      ok: false,
      filepath,
      errors: [`Invalid Headlint config at ${rel(cwd, filepath)}:`, ...parsed.errors],
    };
  }

  return {
    ok: true,
    config: applyDefaults(parsed.config, cwd),
    raw: parsed.config,
    source: "file",
    filepath,
  };
}

function findConfigFile(cwd: string): string | undefined {
  let dir = cwd;
  for (let i = 0; i < 6; i += 1) {
    for (const name of FILENAMES) {
      const candidate = resolve(dir, name);
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * Walk both possible module shapes (tsx-wrapped vs raw ESM/CJS) and
 * return the user's `export default` value, or `undefined` when the
 * file did not declare a default. CommonJS `module.exports = {}`
 * counts as the default — that's the contract Node has used for
 * over a decade.
 */
function unwrapDefaultExport(mod: unknown): unknown {
  if (!mod || typeof mod !== "object") return undefined;
  const outer = mod as Record<string, unknown>;
  if (outer.default === undefined) return undefined;
  const inner = outer.default;
  // tsx's `tsImport` always wraps in a namespace with the
  // `__esModule` marker. When the marker is present, `inner.default`
  // is the user's real default export (and `undefined` when they
  // never wrote `export default`).
  if (
    inner !== null &&
    typeof inner === "object" &&
    (inner as Record<string, unknown>)["__esModule"] === true
  ) {
    return (inner as Record<string, unknown>)["default"];
  }
  // When the marker is absent, the inner object is the
  // named-exports namespace (no default declared). For raw ESM and
  // CJS imports that *did* set `default`, the absence of
  // `__esModule` means the value is the user's value directly.
  // We disambiguate by checking whether `inner` itself looks like a
  // namespace (only enumerable named exports). Heuristic: a
  // namespace from tsx never carries methods or non-trivial
  // prototypes; treat it as "no default".
  if (Object.getPrototypeOf(inner) === null && !("default" in (inner as object))) {
    return undefined;
  }
  return outer.default;
}

async function importConfig(filepath: string): Promise<{ default?: unknown }> {
  if (filepath.endsWith(".ts") || filepath.endsWith(".mts")) {
    // tsImport evaluates the file in an isolated loader scope so the
    // user's own tsx/swc setup (if any) is not affected.
    return (await tsImport(pathToFileURL(filepath).href, import.meta.url)) as {
      default?: unknown;
    };
  }
  return (await import(pathToFileURL(filepath).href)) as { default?: unknown };
}

/**
 * Merge the parsed user config with defaults and resolve
 * `framework: "auto"` against the host project. Pure data-in /
 * data-out — the loader handles file I/O, this function handles
 * shape only.
 */
export function applyDefaults(user: HeadlintConfig, cwd: string): HeadlintConfig {
  const framework =
    !user.framework || user.framework === "auto" ? detectFrameworkFromCwd(cwd) : user.framework;

  return {
    ...user,
    framework,
    i18n: { ...DEFAULT_CONFIG.i18n, ...user.i18n },
    crawl: { ...DEFAULT_CONFIG.crawl, ...user.crawl },
    rules: { ...DEFAULT_CONFIG.rules, ...user.rules },
    normalize: user.normalize ?? DEFAULT_CONFIG.normalize,
    snapshot: { ...DEFAULT_CONFIG.snapshot, ...user.snapshot },
  };
}

function rel(cwd: string, filepath: string): string {
  if (filepath.startsWith(cwd + "/")) return filepath.slice(cwd.length + 1);
  return filepath;
}
