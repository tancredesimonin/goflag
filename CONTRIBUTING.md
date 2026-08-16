# Contributing

Thank you for reading this before opening something. It is short on purpose.

## Where this repository lives

**GitHub is a read-only mirror. The canonical repository is on GitLab**, and so is
the CI that tests, tags and publishes every release.

That has one practical consequence: **a pull request opened on GitHub cannot be
merged.** Nothing on GitHub triggers a pipeline, and a commit that lands here
would be overwritten by the next mirror push. This is not a judgement on the
change — it is a limit of the mirror.

So:

- **Issues: open them here.** Bug reports and questions are read on GitHub and
  are the most useful thing you can send.
- **Code: open the merge request on GitLab.** If you do not have access, open an
  issue here with the diff or a patch attached and it will be carried over with
  attribution.

## Reporting a bug

goflag audits sites, which means the interesting bugs are almost always about a
specific page rather than about the code. A report that lets someone reproduce
the finding is worth ten that describe it.

The most valuable report contains:

- **The URL**, if it is public. Nothing else pins down a finding as precisely.
- **The exact command**, flags included — `--static`, `--profile` and
  `--coverage` change what is even looked at.
- **The JSON, not the terminal output.** `goflag <url> --json > report.json` is
  the source of truth; the terminal rendering is a summary of it.
- **The version**: `goflag --version`, and your Node version.

If the site is not public, a reduced HTML file that reproduces the finding does
the same job — that is exactly what the fixtures under
`packages/cli/fixtures/sites/` are.

### False positives are the priority

A rule that flags a correct page is worse than a rule that misses a wrong one:
it costs trust in every other finding. If goflag reports something you believe
is right, say so — that is a bug report, not a disagreement, and it is the class
of issue handled first.

## Proposing a rule

Every rule in the catalogue answers to a citable source — a specification, a
search engine's own documentation, a registry. A rule with no source does not
get to state a verdict; it states the question instead, and goes to
`prose.ts` / `site-prose.ts` where it carries evidence and no judgement.

So a rule proposal needs, before anything else: **who requires this, and where
do they say so.** "Every SEO blog says to" is the case for an advisory, not for
a rule. Without a source the answer is not "no" — it is "this becomes a
question goflag asks rather than an answer it gives."

## Working in the repository

```sh
corepack enable && pnpm install
pnpm dev https://example.com     # the CLI, from source
pnpm test:unit                   # no network, no browser
pnpm lint && pnpm typecheck && pnpm format:check
```

Integration tests boot real fixture servers and drive real Chromium:

```sh
pnpm --filter @goflag/cli exec playwright install chromium
pnpm test:integration
```

[AGENTS.md](AGENTS.md) is the working document for anyone — human or
otherwise — touching this repository: the invariants that must hold, the
pitfalls that have already cost someone an afternoon, and the things that are
forbidden with the reason next to them. Read it before a first change. It is
short.

Two things from it worth repeating here, because they are the ones that surprise
people:

- **`packages/cli/rules.json` and `flags.json` are generated**, not written. The
  pre-commit hook regenerates them; a test compares them byte for byte.
- **Never hand-edit the version pins** in `README.md` or
  `apps/website/src/lib/constants.ts` — `pnpm release` rewrites both.

## Commits

Conventional Commits, scoped: `feat(cli):`, `fix(website):`, `docs(next):`.
Subjects in this repository are declarative sentences rather than imperatives —
"the site said two site-wide rules, and there are 28", not "fix rule count".
Match what is already in `git log`.

## Licence

By contributing you agree that your contribution is licensed under the MIT
Licence, like the rest of this repository.
