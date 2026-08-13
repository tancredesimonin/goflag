import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { buildFlagCatalog, serialiseFlags } from "./catalog";
import { FLAGS, FLAGS_BY_TOKEN, renderHelp } from "./registry";

const catalog = buildFlagCatalog("9.9.9");
const repoFile = (name: string) =>
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", name);

describe("buildFlagCatalog", () => {
  it("carries every flag the parser accepts, once, and nothing else", () => {
    // The whole point: a consumer reading this cannot be missing a flag the
    // CLI has, which is what a hand-written mirror cannot promise — and did
    // not, having dropped `--coverage` entirely.
    const names = catalog.flags.map((f) => f.name);
    expect(names.length).toBe(FLAGS.length);
    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual(FLAGS.map((f) => f.name).sort());
  });

  it("is ordered by name, so two versions of it diff cleanly", () => {
    const names = catalog.flags.map((f) => f.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("stamps the version it came out of", () => {
    expect(catalog.version).toBe("9.9.9");
  });

  it("is JSON-serialisable, since that is the whole delivery", () => {
    expect(() => JSON.parse(JSON.stringify(catalog))).not.toThrow();
  });
});

describe("the flag table", () => {
  it("gives every flag a long form, and no two the same token", () => {
    const tokens = FLAGS.flatMap((f) => (f.short ? [f.name, f.short] : [f.name]));
    expect(new Set(tokens).size).toBe(tokens.length);
    for (const flag of FLAGS) expect(flag.name.startsWith("--")).toBe(true);
  });

  it("shows both forms of a flag in the label the help prints", () => {
    // `label` is stored rather than derived, because the original text is not
    // consistent about which form comes first. This is what keeps it honest.
    for (const flag of FLAGS) {
      expect(flag.label).toContain(flag.name);
      if (flag.short) expect(flag.label).toContain(flag.short);
      if (flag.arg) expect(flag.label).toContain(flag.arg);
    }
  });

  it("takes a value exactly when it documents an argument", () => {
    // The two used to be independent — a `case` that consumed `argv[i + 1]`
    // and a help line that mentioned `<n>` — so one could move without the
    // other. Now they are the same field, and this says so.
    for (const flag of FLAGS) expect(flag.takesValue).toBe(flag.arg !== undefined);
  });

  it("prints its default in its help text, when that default is a value", () => {
    // A `default` field the help contradicts is the drift this table exists to
    // stop: the reference page reads the field, the terminal reads the text,
    // and they have to agree.
    //
    // Only literal defaults are checkable. Four flags describe theirs in prose
    // instead — "the current directory", "8000 for link probes, 15000 for page
    // fetches" — because the real default is conditional, and prose cannot be
    // expected to appear verbatim in a wrapped help line. Selected by shape
    // rather than by a list of names, so the exemption cannot go stale.
    const literal = FLAGS.filter((f) => f.default && !f.default.includes(" "));
    expect(literal.length).toBeGreaterThan(0);
    for (const flag of literal) {
      const shown = [...flag.help, ...(flag.dynamicTail?.() ?? [])].join(" ");
      expect(shown).toContain(flag.default);
    }
  });

  it("names a flag that actually exists in every `requires`", () => {
    for (const flag of FLAGS) {
      if (!flag.requires) continue;
      expect(FLAGS_BY_TOKEN.has(flag.requires)).toBe(true);
    }
  });

  it("documents every flag the parser dispatches on, and dispatches on every documented one", () => {
    // The bonus that justifies the table's cost: the help and the parser are
    // one list now, so neither can grow a flag the other has never heard of.
    for (const [token, spec] of FLAGS_BY_TOKEN) {
      expect(renderHelp()).toContain(token);
      expect(FLAGS).toContain(spec);
    }
  });
});

describe("flags.json", () => {
  it("matches the flag table, byte for byte", () => {
    // This is the guarantee. The pre-commit hook regenerates the file when the
    // table is staged, but a hook can be skipped with --no-verify and this
    // cannot: a flag added without regenerating fails here, in the suite CI
    // already runs, instead of reaching a reference page that omits it.
    expect(readFileSync(repoFile("flags.json"), "utf8")).toBe(serialiseFlags(buildFlagCatalog()));
  });

  it("carries no version, so a release cannot make it stale", () => {
    const committed = JSON.parse(readFileSync(repoFile("flags.json"), "utf8"));
    expect(committed.version).toBeUndefined();
  });

  it("names every flag in the README that npm publishes, and no other", () => {
    // The last hand-kept copy. `prepack` stages the repository README into the
    // package, so that file *is* the npm page for `@goflag/cli` — and its
    // options block is written by hand, exactly like the reference page on the
    // site was before it started reading `flags.json`.
    //
    // The descriptions there are deliberately abridged, so this does not
    // compare prose. It compares the set of flags, which is the drift that
    // actually hurts: a flag shipped and never mentioned, or a flag removed and
    // still advertised. That is the shape of three of the four defects the
    // documentation audit found.
    // The repository root README, which `prepack` copies in — not the
    // gitignored copy a previous pack may have left in this package.
    const readme = readFileSync(repoFile(join("..", "..", "README.md")), "utf8");
    const options = /\n(--json[\s\S]*?)\n```/.exec(readme)?.[1];
    expect(options).toBeDefined();

    // Only the leading token or two of each entry: `--depth <n>  How far …`
    // yields `--depth`, and `-h, --help  Show help.` yields both forms.
    const documented = new Set(
      options!
        .split("\n")
        .flatMap((line) => /^(-[^\s,]+)(?:,\s*(-[^\s,]+))?/.exec(line)?.slice(1) ?? [])
        .filter((token): token is string => Boolean(token)),
    );
    const shipped = new Set(FLAGS.flatMap((f) => (f.short ? [f.name, f.short] : [f.name])));

    expect([...documented].sort()).toEqual([...shipped].sort());
  });

  it("ships in the published tarball", () => {
    // The site reads it out of `node_modules`, so leaving it out of `files`
    // would make the reference page empty in exactly the place nobody tests.
    const pkg = JSON.parse(readFileSync(repoFile("package.json"), "utf8"));
    expect(pkg.files).toContain("flags.json");
  });
});
