import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  listSnapshots,
  pathFor,
  readSnapshot,
  routeFromFilename,
  SnapshotSchemaError,
  writeSnapshot,
} from "./io";
import { SNAPSHOT_SCHEMA_VERSION, type Snapshot } from "./types";
import { digestSnapshot } from "./digest";

function makeSnap(route: string): Snapshot {
  const body = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    route,
    sampleUrl: `https://example.com${route}`,
    capturedAt: "2026-05-05T19:00:00.000Z",
    tags: [{ key: "title", value: `Title for ${route}` }],
    jsonLd: [],
    ruleOutcomes: {},
  };
  return { ...body, digest: digestSnapshot(body) };
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "headlint-snapshots-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("writeSnapshot / readSnapshot round-trip", () => {
  it("writes a JSON file under the canonical path and reads it back", async () => {
    const snap = makeSnap("/blog/post-1");
    const written = await writeSnapshot(snap, dir);
    expect(written).toBe(pathFor("/blog/post-1", dir));
    const read = await readSnapshot("/blog/post-1", dir);
    expect(read).toEqual(snap);
  });

  it("uses `_root` for the home route", async () => {
    await writeSnapshot(makeSnap("/"), dir);
    const entries = await readdir(dir);
    expect(entries).toContain("_root.json");
  });

  it("creates the target directory if it does not exist", async () => {
    const nested = join(dir, "nested", "snapshots");
    await writeSnapshot(makeSnap("/x"), nested);
    expect((await readdir(nested))[0]).toBe("x.json");
  });

  it("returns null on a missing route", async () => {
    expect(await readSnapshot("/nope", dir)).toBeNull();
  });

  it("rejects a snapshot file with a wrong schemaVersion", async () => {
    await writeFile(
      pathFor("/x", dir),
      JSON.stringify({ schemaVersion: 999, route: "/x" }, null, 2),
    );
    await expect(readSnapshot("/x", dir)).rejects.toBeInstanceOf(SnapshotSchemaError);
  });

  it("does not leave a `.tmp` file behind on success", async () => {
    await writeSnapshot(makeSnap("/y"), dir);
    const entries = await readdir(dir);
    expect(entries.filter((e) => e.endsWith(".tmp"))).toEqual([]);
  });
});

describe("listSnapshots", () => {
  it("returns [] for a missing directory", async () => {
    expect(await listSnapshots(join(dir, "missing"))).toEqual([]);
  });

  it("returns every valid snapshot, sorted by route", async () => {
    await writeSnapshot(makeSnap("/blog/b"), dir);
    await writeSnapshot(makeSnap("/blog/a"), dir);
    await writeSnapshot(makeSnap("/"), dir);
    const out = await listSnapshots(dir);
    expect(out.map((s) => s.route)).toEqual(["/", "/blog/a", "/blog/b"]);
  });

  it("skips files that fail schema validation without throwing", async () => {
    await writeSnapshot(makeSnap("/good"), dir);
    await writeFile(pathFor("/bad", dir), "not even json");
    const out = await listSnapshots(dir);
    expect(out.map((s) => s.route)).toEqual(["/good"]);
  });

  it("skips hidden / non-json entries", async () => {
    await writeSnapshot(makeSnap("/x"), dir);
    await writeFile(join(dir, ".tmp"), "x");
    await writeFile(join(dir, "README.md"), "x");
    const out = await listSnapshots(dir);
    expect(out.map((s) => s.route)).toEqual(["/x"]);
  });
});

describe("routeFromFilename", () => {
  it("strips the .json suffix and recovers the route", () => {
    expect(routeFromFilename("_root.json")).toBe("/");
    expect(routeFromFilename("blog_post-1.json")).toBe("/blog/post-1");
  });
});

describe("io error paths", () => {
  it("rethrows non-ENOENT errors from readSnapshot", async () => {
    // Pointing at a directory triggers EISDIR / EACCES depending on
    // platform — both are non-ENOENT and must propagate.
    await expect(readSnapshot("/x", dir)).resolves.toBeNull();
    // Now make the would-be file path a directory so the read fails
    // with an error other than ENOENT.
    const path = pathFor("/x", dir);
    await rm(path, { force: true });
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path, { recursive: true });
    await expect(readSnapshot("/x", dir)).rejects.toThrow();
  });

  it("rethrows non-ENOENT errors from listSnapshots", async () => {
    // A file-as-directory path provokes a non-ENOENT readdir error
    // on Linux/macOS (ENOTDIR).
    const fakeDir = pathFor("/file-not-dir", dir);
    await writeFile(fakeDir, "x");
    await expect(listSnapshots(fakeDir)).rejects.toThrow();
  });
});

describe("readSnapshot returns parsed JSON content verbatim", () => {
  it("survives Unicode in tag values", async () => {
    const snap = makeSnap("/é");
    snap.tags[0]!.value = "Téléchargements — Über cool";
    snap.digest = digestSnapshot(snap);
    await writeSnapshot(snap, dir);
    const read = await readSnapshot("/é", dir);
    expect(read?.tags[0]?.value).toBe("Téléchargements — Über cool");
  });

  it("preserves trailing newline at write time", async () => {
    await writeSnapshot(makeSnap("/x"), dir);
    const raw = await readFile(pathFor("/x", dir), "utf8");
    expect(raw.endsWith("\n")).toBe(true);
  });
});
