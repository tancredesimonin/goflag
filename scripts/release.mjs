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
    surface: ["packages/cli/src", "packages/cli/package.json", "README.md", "LICENSE"],
  },
  {
    name: "@goflag/next",
    tagPrefix: "next-v",
    manifest: "packages/next/package.json",
    surface: [
      "packages/next/src",
      "packages/next/package.json",
      "packages/next/README.md",
      "packages/next/LICENSE",
    ],
  },
];

/** A commit that earns a version number: a feature, a fix, or a break. */
const RELEASABLE = /^(feat|fix|perf)(\(.+\))?!?:|^[a-z]+(\(.+\))?!:|^BREAKING[ -]CHANGE/m;

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function run(command, ...args) {
  execFileSync(command, args, { stdio: "inherit" });
}

/**
 * The newest tag in a namespace, by version order rather than by reachability.
 *
 * `git describe` would be the obvious call and it is the wrong one here: the
 * tag lives on main, on a merge commit that is not an ancestor of develop, so
 * describe answers "no names found" and every package looks like a first
 * release. Sorting the tag list has no such requirement — and the range it
 * feeds, `tag..HEAD`, is still exactly right, because everything that was on
 * develop when the tag was cut is reachable from the merge commit it points at.
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

  const subjects = git("log", "--format=%B", range);
  if (!RELEASABLE.test(subjects)) {
    return {
      release: false,
      why: `no feat/fix/perf/breaking commit since ${tag ?? "the first commit"}`,
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
