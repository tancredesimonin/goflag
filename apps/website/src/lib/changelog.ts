import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The changelog page, parsed from the files `commit-and-tag-version` writes.
 *
 * Read at build time from each package's `CHANGELOG.md` rather than copied
 * here, so the page cannot drift from what actually shipped. This is a file
 * read and not an import: invariant I3 forbids `apps/**` from importing
 * `packages/cli`, and the reason behind it (the site must not depend on either
 * package's build) holds for a generated markdown file too.
 *
 * Two packages, one page. They ship on their own version lines, so a merged
 * timeline is the only view that answers "what changed, and when": two pages
 * would ask the reader to hold both in their head, and a tab would hide half
 * the history behind a click nobody makes.
 */

/** Which package a release belongs to. Ordered: the CLI leads a shared date. */
export const PACKAGES = ["cli", "next"] as const;
export type PackageId = (typeof PACKAGES)[number];

export interface ChangelogEntry {
  /** Conventional-commit subject, with the scope split out. */
  subject: string;
  scope: string | null;
  /** Short commit SHA, when the generator recorded one. */
  sha: string | null;
  commitUrl: string | null;
}

export type ChangelogSectionId = "breaking" | "features" | "fixes" | "docs" | "other";

export interface ChangelogSection {
  id: ChangelogSectionId;
  entries: ChangelogEntry[];
}

export interface ChangelogRelease {
  /** The package this version belongs to. Two version lines share this page. */
  package: PackageId;
  version: string;
  /** ISO date the generator recorded, or null for a hand-written heading. */
  date: string | null;
  /** Compare link against the previous tag, when there is one. */
  compareUrl: string | null;
  sections: ChangelogSection[];
  /** Prose under the version heading that is not a section list. */
  note: string | null;
}

const SECTION_IDS: Record<string, ChangelogSectionId> = {
  "breaking changes": "breaking",
  features: "features",
  "bug fixes": "fixes",
  documentation: "docs",
  "performance improvements": "other",
  reverts: "other",
};

/**
 * `commit-and-tag-version` writes "⚠ BREAKING CHANGES", warning sign included.
 * Matching on the letters alone means the heading keeps its decoration without
 * the lookup having to know about it.
 */
function sectionLabel(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .trim();
}

/** `## [0.1.4](https://…/compare/v0.1.3...v0.1.4) (2026-08-04)` and its plain variant. */
const RELEASE_HEADING = /^## \[?([0-9][^\]\s]*)\]?(?:\(([^)]+)\))?(?: \(([\d-]+)\))?/;
/** `* **cli:** subject ([abc1234](https://…/commit/abc…))` */
const ENTRY = /^[*-] (?:\*\*([^*]+):\*\* )?(.+?)(?:\s*\(\[([0-9a-f]{6,})\]\(([^)]+)\)\))?$/;

function parseEntry(line: string): ChangelogEntry | null {
  const match = ENTRY.exec(line.trim());
  if (!match) return null;

  return {
    scope: match[1] ?? null,
    subject: (match[2] ?? "").trim(),
    sha: match[3] ?? null,
    commitUrl: match[4] ?? null,
  };
}

export function parseChangelog(markdown: string, pkg: PackageId): ChangelogRelease[] {
  const releases: ChangelogRelease[] = [];
  let release: ChangelogRelease | null = null;
  let section: ChangelogSectionId | null = null;
  const note: string[] = [];

  const flushNote = () => {
    if (release && note.length > 0) {
      release.note = note.join(" ").replace(/\s+/g, " ").trim() || null;
      note.length = 0;
    }
  };

  /**
   * An entry is not always one line. `commit-and-tag-version` reflows a long
   * BREAKING CHANGE body across several, and parsing only the first printed a
   * sentence that stopped at a semicolon. So the lines are collected and parsed
   * together, which also keeps the commit link when it lands on the last one.
   */
  let entryLines: string[] = [];

  const flushEntry = () => {
    if (!release || entryLines.length === 0) return;

    const entry = parseEntry(entryLines.join(" "));
    entryLines = [];
    if (!entry) return;

    const id = section ?? "other";
    const bucket = release.sections.find((candidate) => candidate.id === id);
    if (bucket) bucket.entries.push(entry);
    else release.sections.push({ id, entries: [entry] });
  };

  for (const line of markdown.split("\n")) {
    const heading = line.startsWith("## ") ? RELEASE_HEADING.exec(line) : null;

    if (heading) {
      flushEntry();
      flushNote();
      release = {
        package: pkg,
        version: heading[1] ?? "",
        compareUrl: heading[2] ?? null,
        date: heading[3] ?? null,
        sections: [],
        note: null,
      };
      section = null;
      releases.push(release);
      continue;
    }

    if (!release) continue;

    if (line.startsWith("#")) {
      flushEntry();
      flushNote();
      if (line.startsWith("### ")) {
        section = SECTION_IDS[sectionLabel(line.slice(4))] ?? "other";
      }
      continue;
    }

    if (/^[*-] /.test(line.trim())) {
      flushEntry();
      entryLines = [line.trim()];
      continue;
    }

    // A blank line closes an entry. Anything else that follows one belongs to
    // it, which is how a reflowed body stays whole.
    if (!line.trim()) {
      flushEntry();
      continue;
    }

    if (entryLines.length > 0) {
      entryLines.push(line.trim());
      continue;
    }

    // Prose directly under a version heading. The 0.1.0 entry has one, and
    // dropping it would silently delete the only hand-written line in the file.
    if (section === null) note.push(line.trim());
  }

  flushEntry();
  flushNote();

  return releases;
}

/**
 * Where each package keeps its changelog, two directories up from the app.
 *
 * Leaving `apps/website` is what the reads below have to be excused for: see
 * `getChangelog`.
 */
const SOURCES: Record<PackageId, string> = {
  cli: join(process.cwd(), "..", "..", "packages", "cli", "CHANGELOG.md"),
  next: join(process.cwd(), "..", "..", "packages", "next", "CHANGELOG.md"),
};

/**
 * Every release of every package, newest first.
 *
 * A missing file yields nothing rather than failing the build. `@goflag/next`
 * had no changelog until its first automatic release wrote one, and a site that
 * cannot be built until a sibling package has shipped is a coupling the file
 * read was chosen to avoid.
 *
 * Sorted on the date the generator recorded. Same date means the same merge to
 * main, so the tie is broken by package order and the CLI leads.
 *
 * ## Why the two reads are excused from tracing
 *
 * Turbopack's static analysis cannot see where these paths lead — they are
 * built with `join(process.cwd(), "..", "..")`, which walks out of the app —
 * so it assumes the worst and traces the **whole project** into the server
 * output. Its own warning says what that costs: "all source files (including
 * the public folder) deployed as part of the server code", and it names the
 * escape hatch used here.
 *
 * Excusing them is honest rather than convenient. The paths are two constants
 * fixed at build time, not user input; the files are read once during static
 * generation and never at request time; and the tracing being skipped would
 * only ever have pulled in files this page does not open. Since `public/` now
 * holds a committed `favicon.ico`, the warning had started naming something
 * real.
 *
 * The day this stops being true — a third package, a path that varies — the
 * answer is to copy the changelogs under `apps/website` in a prebuild step so
 * the read is statically scoped, not to widen the exemption.
 */
export function getChangelog(): ChangelogRelease[] {
  return PACKAGES.flatMap((pkg) => {
    const path = SOURCES[pkg];
    if (!existsSync(/*turbopackIgnore: true*/ path)) return [];

    return parseChangelog(readFileSync(/*turbopackIgnore: true*/ path, "utf8"), pkg);
  }).sort((a, b) => {
    if (a.date !== b.date) return (b.date ?? "").localeCompare(a.date ?? "");
    return PACKAGES.indexOf(a.package) - PACKAGES.indexOf(b.package);
  });
}

/** The newest version of each package, for the header. */
export function currentVersions(releases: ChangelogRelease[]): Array<{
  package: PackageId;
  version: string;
}> {
  return PACKAGES.flatMap((pkg) => {
    const latest = releases.find((release) => release.package === pkg);
    return latest ? [{ package: pkg, version: latest.version }] : [];
  });
}
