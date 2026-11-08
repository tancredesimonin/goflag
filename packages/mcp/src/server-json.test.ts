import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * `server.json` is what the MCP registry lists, and the registry checks it
 * against the npm package it names: `name` has to be that package's `mcpName`,
 * and the version it points at has to exist on npm. `scripts/release.mjs`
 * rewrites both versions with the manifest's; this keeps a hand edit from
 * drifting, since a version the registry has published cannot be corrected.
 */
const read = (file: string) =>
  JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));

const manifest = read("package.json");
const server = read("server.json");

describe("server.json", () => {
  it("names the server the way the npm package does", () => {
    expect(server.name).toBe(manifest.mcpName);
    expect(server.packages).toEqual([
      expect.objectContaining({ registryType: "npm", identifier: manifest.name }),
    ]);
  });

  it("points at the version the manifest is at", () => {
    expect(server.version).toBe(manifest.version);
    expect(server.packages[0].version).toBe(manifest.version);
  });

  it("fits the registry's 100-character description", () => {
    expect(server.description.length).toBeLessThanOrEqual(100);
  });
});
