#!/usr/bin/env node
/**
 * Write the release commits, on a branch, for review.
 *
 * `main` and `develop` refuse a push from everyone — CI included — so the
 * version bump and the changelog cannot be authored by a runner. They are
 * authored here, merged like any other commit, and the `tag` job on main turns
 * the version it finds into a tag. That job creates no commits and decides
 * nothing; every judgement about whether a release is warranted lives in this
 * file.
 *
 * Usage, from a branch cut off develop:
 *
 *   pnpm release            # bump what moved, write the changelogs, commit
 *   pnpm release --dry-run  # say what it would do, touch nothing
 *
 * Then open a merge request into develop, and merge develop into main when the
 * release is the decision you mean to make.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const DRY_RUN = process.argv.includes("--dry-run");

/**
 * The published surface of each package: its source, its manifest, and the
 * files that reach its tarball. `dist/` is absent because it is built from
 * `src` and never committed.
 *
 * These lists are the same ones the `tag` job used to carry, and they are the
 * reason a `fix(ci)` spends no version number.
 */
const PACKAGES = [
  {
    name: "@goflag/cli",
    tagPrefix: "v",
    manifest: "packages/cli/package.json",
    /** The literal in `apps/website` that quotes this version. */
    quotedAs: "PACKAGE",
    surface: ["packages/cli/src", "packages/cli/package.json", "README.md", "LICENSE"],
  },
  {
    name: "@goflag/next",
    tagPrefix: "next-v",
    manifest: "packages/next/package.json",
    quotedAs: "LIB",
    surface: [
      "packages/next/src",
      "packages/next/package.json",
      "packages/next/README.md",
      "packages/next/LICENSE",
    ],
  },
  {
    name: "@goflag/og",
    tagPrefix: "og-v",
    manifest: "packages/og/package.json",
    // No `quotedAs`: the site documents the CLI and the library and quotes
    // their versions in install snippets. It has no page for this one yet, so
    // there is no literal to keep in step — and inventing a constant nothing
    // renders would be a guard over nothing.
    surface: [
      "packages/og/src",
      "packages/og/package.json",
      "packages/og/README.md",
      "packages/og/LICENSE",
    ],
  },
];

/** A commit that earns a version number: a feature, a fix, or a break. */
const RELEASABLE = /^(feat|fix|perf)(\(.+\))?!?:|^[a-z]+(\(.+\))?!:|^BREAKING[ -]CHANGE/m;

/**
 * Carry the new version into the literal `apps/website` quotes.
 *
 * The site writes both versions as string literals — `constants.ts` reaches
 * client components, so reading a manifest there would make every one of them
 * server-only. `constants.test.ts` guards the two against drift, which means
 * every release fails the site's own test suite until this is done. Doing it
 * here rather than by hand is the difference between a guard and a chore: the
 * literal sat at `0.1.4` while `0.2.0` was on npm, which is exactly what a
 * manual step produces.
 */
function quoteVersion(constant, version) {
  const file = "apps/website/src/lib/constants.ts";
  const source = readFileSync(file, "utf8");
  const pattern = new RegExp(`(export const ${constant} = \\{[^}]*?version: ")[^"]+(")`, "s");

  if (!pattern.test(source)) {
    throw new Error(`Could not find ${constant}.version in ${file}`);
  }

  writeFileSync(file, source.replace(pattern, `$1${version}$2`), "utf8");
}

/**
 * Carry the new version into the pins the README's CI samples show.
 *
 * The samples exist to be copied, so they pin a version rather than floating —
 * which is the advice the README itself gives two sections earlier. A pinned
 * literal nobody moves is a literal that lies: at 0.2.6 both jobs referenced a
 * version that had never reached npm, so anyone copying them got
 * `npx: version not found` on their first run.
 *
 * Carried here for the same reason as the site's constant: a hand-updated
 * number is a chore, and a chore that only fails somebody else's build is one
 * nobody remembers. Only the CLI has pins to move.
 */
function quoteVersionInReadme(version) {
  const file = "README.md";
  const source = readFileSync(file, "utf8");

  const updated = source
    .replace(/(GOFLAG_VERSION: ")[^"]+(")/g, `$1${version}$2`)
    .replace(/(@goflag\/cli@)\d+\.\d+\.\d+/g, `$1${version}`);

  if (updated === source) {
    throw new Error(`Found no version pin to update in ${file}`);
  }

  writeFileSync(file, updated, "utf8");
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function run(command, ...args) {
  execFileSync(command, args, { stdio: "inherit" });
}

/**
 * The newest tag in a namespace, by version order rather than by reachability.
 *
 * `git describe` would be the obvious call. It is avoided here because it
 * answers only for tags it can reach, and this script decides whether to
 * release before knowing that the tag it needs was placed somewhere reachable.
 * Sorting the tag list has no such requirement.
 *
 * The CI job does now tag the develop side of each merge, precisely so that
 * `git describe` works — `commit-and-tag-version` uses it internally to find
 * the previous tag, and when it could not, it replayed the whole history into
 * every changelog. That fix makes describe viable here too; this stays as it
 * is because it is the more robust of the two and costs nothing.
 */
function lastTag(prefix) {
  const tags = git("tag", "--list", `${prefix}[0-9]*`, "--sort=-v:refname")
    .split("\n")
    .filter(Boolean);

  // `v[0-9]*` also matches nothing else, but `next-v*` would be caught by a
  // loose `v*` glob in the other direction if the prefixes ever grow.
  return tags.find((tag) => tag.startsWith(prefix)) ?? null;
}

function decide(pkg) {
  const tag = lastTag(pkg.tagPrefix);
  const range = tag ? `${tag}..HEAD` : "HEAD";

  // Scoped to this package's surface, and that scoping is the whole test.
  //
  // Unscoped, this read every commit in the repository and then asked
  // separately whether the package's files had moved — so a `feat` anywhere,
  // plus any edit touching a manifest, released that package. It happened on
  // 2026-08-16: a chore adding `--tag-prefix` to all three `package.json`
  // files, alongside a `refactor(og)!`, spent `@goflag/cli@0.2.12` and
  // `@goflag/next@0.3.4` on nothing. Both changelog sections came out empty,
  // which is the symptom worth remembering — a version whose entry has no
  // bullet under it was decided by a commit that belongs to another package.
  const subjects = git("log", "--format=%B", range, "--", ...pkg.surface);
  if (!RELEASABLE.test(subjects)) {
    return {
      release: false,
      why: `no feat/fix/perf/breaking commit touching its surface since ${tag ?? "the first commit"}`,
    };
  }

  // The commit type alone is not enough. `fix(ci)` and `fix(deps)` are honest
  // conventional-commit fixes that change nothing a consumer can install —
  // three of the four versions tagged on 2026-08-02 were exactly that, each
  // spending a number and queueing a merge request on every consuming site.
  //
  // A first release has nothing to diff against and always goes out.
  if (!tag) return { release: true, why: "first release", moved: [] };

  const moved = git("diff", "--name-only", `${tag}..HEAD`, "--", ...pkg.surface)
    .split("\n")
    .filter(Boolean);

  if (moved.length === 0) {
    return { release: false, why: `nothing under the published surface changed since ${tag}` };
  }

  return { release: true, why: `published surface changed since ${tag}`, moved };
}

const branch = git("rev-parse", "--abbrev-ref", "HEAD");
if (branch === "main" || branch === "develop") {
  console.error(
    `On ${branch}, which refuses a push from everyone. Cut a branch first:\n` +
      `  git switch -c chore/release\n`,
  );
  process.exit(1);
}

if (!DRY_RUN && git("status", "--porcelain") !== "") {
  console.error(
    "Working tree is dirty. commit-and-tag-version commits straight after the\n" +
      "bump, and a stray file next to package.json is one `git add` from shipping.",
  );
  process.exit(1);
}

git("fetch", "origin", "--tags", "--quiet");

let released = 0;

for (const pkg of PACKAGES) {
  const verdict = decide(pkg);

  if (!verdict.release) {
    console.log(`${pkg.name}: ${verdict.why} — nothing to release.`);
    continue;
  }

  console.log(`${pkg.name}: ${verdict.why}`);
  for (const path of verdict.moved ?? []) console.log(`  ${path}`);

  if (DRY_RUN) {
    console.log(`${pkg.name}: would bump and write the changelog.\n`);
    released += 1;
    continue;
  }

  // `--skip.tag` is in the package script: tags are created by CI, at the
  // commit that is on main, never here. A tag written locally would point at a
  // branch commit that a merge is about to rewrite the history around.
  run("pnpm", "--filter", pkg.name, "release");

  const version = JSON.parse(
    execFileSync("node", ["-p", `JSON.stringify(require('./${pkg.manifest}'))`], {
      encoding: "utf8",
    }),
  ).version;

  if (pkg.quotedAs) {
    quoteVersion(pkg.quotedAs, version);
    run("git", "add", "apps/website/src/lib/constants.ts");
  }
  if (pkg.name === "@goflag/cli") {
    quoteVersionInReadme(version);
    run("git", "add", "README.md");
  }
  run("git", "commit", "--amend", "--no-edit", "--no-verify");

  console.log(`${pkg.name}: ${version}\n`);
  released += 1;
}

if (released === 0) {
  console.log("Nothing to release.");
  process.exit(0);
}

console.log(
  DRY_RUN
    ? "Dry run: nothing was written."
    : "Open a merge request into develop. The tag job on main does the rest.",
);
