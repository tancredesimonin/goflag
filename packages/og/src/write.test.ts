import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildIco } from "./ico.js";
import { fingerprint, writeIco, writeIcons } from "./write.js";

let dir = "";
const at = (...parts: string[]) => join(dir, ...parts);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "goflag-og-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("fingerprint", () => {
  it("is stable for the same inputs", () => {
    expect(fingerprint(["<svg/>", 16, 32])).toBe(fingerprint(["<svg/>", 16, 32]));
  });

  it("moves when an input does", () => {
    expect(fingerprint(["<svg/>", 16])).not.toBe(fingerprint(["<svg/>", 17]));
  });

  it("separates its parts, so a regrouped list is a different list", () => {
    expect(fingerprint(["ab", "c"])).not.toBe(fingerprint(["a", "bc"]));
  });

  it("reads bytes as well as strings", () => {
    expect(fingerprint([new Uint8Array([1, 2, 3])])).toHaveLength(64);
  });
});

describe("writeIcons", () => {
  const icon = (path: string, byte: number) => ({
    path,
    render: () => new Uint8Array([byte]),
  });

  it("writes the artefacts and records the fingerprint", async () => {
    const status = await writeIcons({
      artefacts: [icon(at("public", "favicon.ico"), 1)],
      lock: at(".favicon-fingerprint"),
      fingerprintOf: ["<svg/>", 16],
    });

    expect(status).toBe("written");
    expect(existsSync(at("public", "favicon.ico"))).toBe(true);
    expect(readFileSync(at(".favicon-fingerprint"), "utf8").trim()).toBe(
      fingerprint(["<svg/>", 16]),
    );
  });

  it("renders nothing at all on the second run", async () => {
    // The whole point of D7. A hook that re-rasterises every commit is what
    // dirties the file, and `sharp` re-compressing the same pixels into
    // different bytes is what makes the noise look like a change.
    const options = {
      lock: at("lock"),
      fingerprintOf: ["<svg/>"],
    };
    const render = vi.fn(() => new Uint8Array([1]));

    await writeIcons({ ...options, artefacts: [{ path: at("a.ico"), render }] });
    const second = await writeIcons({ ...options, artefacts: [{ path: at("a.ico"), render }] });

    expect(second).toBe("unchanged");
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("rewrites when an input moved", async () => {
    const artefacts = [icon(at("a.ico"), 1)];
    await writeIcons({ artefacts, lock: at("lock"), fingerprintOf: ["<svg/>"] });

    const status = await writeIcons({
      artefacts: [icon(at("a.ico"), 2)],
      lock: at("lock"),
      fingerprintOf: ["<svg stroke='2'/>"],
    });

    expect(status).toBe("written");
    expect([...readFileSync(at("a.ico"))]).toEqual([2]);
  });

  it("rewrites when a file was deleted, however right the lock still looks", async () => {
    const artefacts = [icon(at("a.ico"), 1)];
    const options = { artefacts, lock: at("lock"), fingerprintOf: ["<svg/>"] };

    await writeIcons(options);
    rmSync(at("a.ico"));

    expect(await writeIcons(options)).toBe("written");
    expect(existsSync(at("a.ico"))).toBe(true);
  });

  describe("check", () => {
    const options = () => ({
      artefacts: [icon(at("a.ico"), 1)],
      lock: at("lock"),
      fingerprintOf: ["<svg/>"],
      check: true,
    });

    it("reports `absent` and writes nothing when the file is not there", async () => {
      expect(await writeIcons(options())).toBe("absent");
      expect(existsSync(at("a.ico"))).toBe(false);
      expect(existsSync(at("lock"))).toBe(false);
    });

    it("reports `stale` and writes nothing when the inputs moved", async () => {
      await writeIcons({ ...options(), check: false });
      writeFileSync(at("lock"), "not the fingerprint\n");

      expect(await writeIcons(options())).toBe("stale");
      expect(readFileSync(at("lock"), "utf8").trim()).toBe("not the fingerprint");
    });

    it("reports `unchanged` when the committed file matches its inputs", async () => {
      await writeIcons({ ...options(), check: false });

      expect(await writeIcons(options())).toBe("unchanged");
    });

    it("never calls a renderer", async () => {
      const render = vi.fn(() => new Uint8Array([1]));

      await writeIcons({ ...options(), artefacts: [{ path: at("a.ico"), render }] });

      expect(render).not.toHaveBeenCalled();
    });
  });

  it("refuses to guard nothing", async () => {
    await expect(
      writeIcons({ artefacts: [], lock: at("lock"), fingerprintOf: [] }),
    ).rejects.toThrow(/no artefacts/);
  });
});

describe("writeIco", () => {
  const entries = [{ width: 16, bytes: new Uint8Array([1, 2, 3]) }];

  it("packs the container and guards it like anything else here", async () => {
    const status = await writeIco(at("public", "favicon.ico"), entries, {
      lock: at(".favicon-fingerprint"),
      fingerprintOf: ["<svg/>", 16],
    });

    expect(status).toBe("written");
    expect([...readFileSync(at("public", "favicon.ico"))]).toEqual([...buildIco(entries)]);
  });

  it("takes a thunk, so nothing is rasterised on a run that writes nothing", async () => {
    const options = { lock: at("lock"), fingerprintOf: ["<svg/>"] };
    const rasterise = vi.fn(() => entries);

    await writeIco(at("a.ico"), rasterise, options);
    expect(await writeIco(at("a.ico"), rasterise, options)).toBe("unchanged");
    expect(rasterise).toHaveBeenCalledTimes(1);
  });
});
