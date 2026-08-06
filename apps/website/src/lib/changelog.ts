import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The changelog page, parsed from the file `commit-and-tag-version` writes.
 *
 * Read at build time from `packages/cli/CHANGELOG.md` rather than copied here,
 * so the page cannot drift from what actually shipped. This is a file read and
 * not an import: invariant I3 forbids `apps/**` from importing `packages/cli`,
 * and the reason behind it — the site must not depend on the CLI's build — holds
 * for a generated markdown file too.
 */

export interface ChangelogEntry {
  /** Conventional-commit subject, with the scope split out. */
  subject: string;
  scope: string | null;
  /** Short commit SHA, when the generator recorded one. */
  sha: string | null;
  commitUrl: string | null;
}

export type ChangelogSectionId = "features" | "fixes" | "docs" | "other";

export interface ChangelogSection {
  id: ChangelogSectionId;
  entries: ChangelogEntry[];
}

export interface ChangelogRelease {
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
  features: "features",
  "bug fixes": "fixes",
  documentation: "docs",
  "performance improvements": "other",
  reverts: "other",
};

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

export function parseChangelog(markdown: string): ChangelogRelease[] {
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

  for (const line of markdown.split("\n")) {
    const heading = line.startsWith("## ") ? RELEASE_HEADING.exec(line) : null;

    if (heading) {
      flushNote();
      release = {
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

    if (line.startsWith("### ")) {
      flushNote();
      const label = line.slice(4).trim().toLowerCase();
      section = SECTION_IDS[label] ?? "other";
      continue;
    }

    if (/^[*-] /.test(line.trim())) {
      const entry = parseEntry(line);
      if (!entry) continue;

      const id = section ?? "other";
      const bucket = release.sections.find((candidate) => candidate.id === id);
      if (bucket) bucket.entries.push(entry);
      else release.sections.push({ id, entries: [entry] });
      continue;
    }

    // Prose directly under a version heading — the 0.1.0 entry has one, and
    // dropping it would silently delete the only hand-written line in the file.
    if (line.trim() && section === null) note.push(line.trim());
  }

  flushNote();

  return releases;
}

export function getChangelog(): ChangelogRelease[] {
  const path = join(process.cwd(), "..", "..", "packages", "cli", "CHANGELOG.md");
  return parseChangelog(readFileSync(path, "utf8"));
}
