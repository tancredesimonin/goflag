/**
 * Snapshot writer / reader.
 *
 * The only side-effecting module under `src/lib/snapshots/`. Every
 * other file in this folder is pure.
 *
 * Files live under `<dir>/<route-slug>.json`. The directory comes
 * from `config.snapshot.dir` (default `.headlint/snapshots`); the
 * slug comes from `routeToFilename`. Writes are atomic — a temp
 * sibling file plus a `rename` — so a crash mid-write never leaves
 * the user with a half-written committed file.
 *
 * Reads validate `schemaVersion` and throw `SnapshotSchemaError` on
 * mismatch. The CLI translates that into a friendly "this snapshot
 * was written by an older Headlint, run `headlint snapshot --update`
 * to refresh" message.
 */

import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import type { Snapshot } from "./types";
import { SNAPSHOT_SCHEMA_VERSION } from "./types";
import { filenameToRoute, routeToFilename } from "./route";

export class SnapshotSchemaError extends Error {
  readonly path: string;
  readonly actualVersion: unknown;
  constructor(message: string, path: string, actualVersion: unknown) {
    super(message);
    this.name = "SnapshotSchemaError";
    this.path = path;
    this.actualVersion = actualVersion;
  }
}

/**
 * Write a snapshot to disk atomically.
 *
 * The flow is:
 *   1. `mkdir -p <dir>` (no-op if it exists).
 *   2. Write JSON to `<dir>/.<final>.<uuid>.tmp`.
 *   3. `rename` to `<dir>/<final>`.
 *
 * On a same-filesystem rename (the overwhelming majority of cases)
 * step 3 is atomic — readers either see the old file or the new
 * file, never a half-written one. If step 3 throws, the caller's
 * error handler runs with the temp file still on disk; we swallow
 * the cleanup error inside a `finally` so the original error
 * surfaces unchanged.
 */
export async function writeSnapshot(snap: Snapshot, dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const finalPath = pathFor(snap.route, dir);
  const tmpPath = join(dir, `.${routeToFilename(snap.route)}.${randomUUID()}.tmp`);
  const body = `${JSON.stringify(snap, null, 2)}\n`;
  try {
    await writeFile(tmpPath, body, "utf8");
    await rename(tmpPath, finalPath);
  } finally {
    // Best-effort cleanup. After a successful rename the temp file
    // no longer exists, so this is a no-op; after a failed rename it
    // removes the orphan. The catch swallows the rare race where the
    // OS already cleaned up between the rename and the rm.
    await rm(tmpPath, { force: true }).catch(() => {});
  }
  return finalPath;
}

/**
 * Read a snapshot for a given route, returning `null` when no file
 * exists. Anything else (parse failure, schema mismatch, I/O error)
 * surfaces as a thrown error.
 */
export async function readSnapshot(route: string, dir: string): Promise<Snapshot | null> {
  const path = pathFor(route, dir);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw err;
  }
  return parseSnapshot(raw, path);
}

/**
 * List every snapshot in `dir`. Files that aren't `*.json`, hidden
 * `.tmp` files from a crashed write, or files that fail schema
 * validation are silently skipped — `headlint snapshot` can recover
 * from a partially corrupted directory; refusing to list because
 * one file is broken would be hostile to the dev workflow.
 */
export async function listSnapshots(dir: string): Promise<Snapshot[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const snaps: Snapshot[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    if (entry.startsWith(".")) continue;
    const path = join(dir, entry);
    try {
      const raw = await readFile(path, "utf8");
      snaps.push(parseSnapshot(raw, path));
    } catch {
      // Best-effort listing; a single broken file does not poison the rest.
    }
  }
  // Stable order by route — the UI sidebar and the CI report both
  // benefit from the same ordering.
  snaps.sort((a, b) => (a.route < b.route ? -1 : a.route > b.route ? 1 : 0));
  return snaps;
}

/**
 * Compute the canonical filesystem path for a route's snapshot.
 * Exposed so callers (the UI's "Accept changes" server action,
 * tests) can talk about paths without re-implementing the slug.
 */
export function pathFor(route: string, dir: string): string {
  return join(dir, `${routeToFilename(route)}.json`);
}

/** Inverse of `pathFor` — used by `listSnapshots` for completeness. */
export function routeFromFilename(filename: string): string {
  return filenameToRoute(filename.replace(/\.json$/, ""));
}

function parseSnapshot(raw: string, path: string): Snapshot {
  const data = JSON.parse(raw) as { schemaVersion?: unknown };
  if (data.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    throw new SnapshotSchemaError(
      `snapshot at ${path} has schemaVersion ${String(data.schemaVersion)}; ` +
        `this Headlint expects ${SNAPSHOT_SCHEMA_VERSION}. Re-run with --update to refresh.`,
      path,
      data.schemaVersion,
    );
  }
  return data as Snapshot;
}
