/**
 * Copies the repository README and LICENSE into the package being packed.
 *
 * npm always ships `README.md` and `LICENSE` from the *package* directory and
 * never looks upward, so a monorepo package publishes an empty npm page and no
 * licence text unless those files sit next to its `package.json`. Committing
 * copies would mean two files to keep in step; staging them at pack time keeps
 * the repository root the single source of truth.
 *
 * Run from a package directory via its `prepack` script. The copies are
 * gitignored, and `pnpm clean` removes them.
 *
 * A package that warrants its own README should author one and drop the
 * `prepack` hook rather than teach this script about exceptions.
 */
import { copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageDir = process.cwd();

if (packageDir === repoRoot) {
  throw new Error("stage-package-docs must run from a package directory, not the repository root");
}

for (const file of ["README.md", "LICENSE"]) {
  copyFileSync(join(repoRoot, file), join(packageDir, file));
}
