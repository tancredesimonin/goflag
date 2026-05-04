import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { findFreePort, findLocalBin, waitForReady } from "./dev-server";

class FakeChild extends EventEmitter {
  stdout = new Readable({ read() {} });
  stderr = new Readable({ read() {} });
}

describe("findFreePort", () => {
  it("returns a port that another listener can bind to", async () => {
    const port = await findFreePort();
    expect(port).toBeGreaterThan(0);
  });
});

describe("findLocalBin", () => {
  it("walks up to find the headlint repo's own next binary", () => {
    // We're running inside the headlint repo, so the lookup must succeed
    // for whatever binary actually lives in node_modules/.bin.
    expect(findLocalBin("next", __dirname)).toMatch(/node_modules.*\/\.bin\/next/);
  });
  it("returns undefined when the binary doesn't exist", () => {
    expect(findLocalBin("definitely-not-a-binary-xyz", __dirname)).toBeUndefined();
  });
});

describe("waitForReady", () => {
  it("resolves on a ready banner from stdout", async () => {
    const child = new FakeChild();
    const promise = waitForReady(child, 200);
    child.stdout.push("Next.js 15.0\n  ▲ Ready in 1.2s\n");
    await expect(promise).resolves.toBeUndefined();
  });

  it("rejects when the child exits before becoming ready", async () => {
    const child = new FakeChild();
    const promise = waitForReady(child, 1000);
    child.emit("exit", 1);
    await expect(promise).rejects.toThrow(/exited before ready/);
  });

  it("rejects on timeout", async () => {
    const child = new FakeChild();
    await expect(waitForReady(child, 5)).rejects.toThrow(/Timed out/);
  });

  it("matches a 'started server' banner on stderr too", async () => {
    const child = new FakeChild();
    const promise = waitForReady(child, 500);
    child.stderr.push("started server on http://127.0.0.1:3000\n");
    await expect(promise).resolves.toBeUndefined();
  });
});
