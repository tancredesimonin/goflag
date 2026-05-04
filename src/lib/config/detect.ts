/**
 * Framework detection.
 *
 * Reads a `package.json` (or accepts an already-parsed manifest) and
 * returns the best-guess framework. Detection precedence is
 * deliberate: when both `next` and `@remix-run/react` are present
 * (a very rare but real combo), Next wins because `headlint init`
 * has more useful Next snippets — Remix detection still flags
 * correctly when Next is absent.
 *
 * Fixture-driven test coverage lives in
 * `src/lib/config/detect.test.ts`. The integration tests in
 * `test/integration/framework-detect.test.ts` exercise the real
 * filesystem read against a handful of fixture `package.json`
 * files.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Framework } from "./types";

export interface PackageManifest {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

/**
 * Probe ordering: when multiple frameworks coexist in `dependencies`,
 * the first matching probe wins. Order is "highest information rule
 * pack" first — Next wins over Remix wins over Vite, etc.
 */
const PROBES: Array<{ framework: Framework; deps: string[] }> = [
  { framework: "next", deps: ["next"] },
  { framework: "nuxt", deps: ["nuxt", "nuxt3"] },
  { framework: "astro", deps: ["astro"] },
  { framework: "sveltekit", deps: ["@sveltejs/kit"] },
  { framework: "remix", deps: ["@remix-run/react", "@remix-run/node"] },
  { framework: "vite-react", deps: ["vite", "@vitejs/plugin-react"] },
];

export function detectFrameworkFromManifest(manifest: PackageManifest): Framework {
  const all = collectDeps(manifest);
  for (const probe of PROBES) {
    if (probe.deps.some((d) => all.has(d))) return probe.framework;
  }
  return "unknown";
}

/**
 * Walk up from `cwd` looking for the nearest `package.json`. Returns
 * `"unknown"` when no manifest is found within 6 levels (the limit
 * matches what most monorepo tools use).
 */
export function detectFrameworkFromCwd(cwd: string): Framework {
  const manifestPath = findNearestPackageJson(cwd);
  if (!manifestPath) return "unknown";
  try {
    const raw = JSON.parse(readFileSync(manifestPath, "utf8"));
    return detectFrameworkFromManifest(raw as PackageManifest);
  } catch {
    return "unknown";
  }
}

function collectDeps(manifest: PackageManifest): Set<string> {
  const out = new Set<string>();
  for (const bucket of [
    manifest.dependencies,
    manifest.devDependencies,
    manifest.peerDependencies,
  ]) {
    if (!bucket) continue;
    for (const name of Object.keys(bucket)) out.add(name);
  }
  return out;
}

function findNearestPackageJson(cwd: string): string | undefined {
  let dir = resolve(cwd);
  for (let i = 0; i < 6; i += 1) {
    const candidate = resolve(dir, "package.json");
    if (existsSync(candidate)) return candidate;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}
