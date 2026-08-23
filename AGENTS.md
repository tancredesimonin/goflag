# AGENTS.md

Two products in one pnpm workspace, and they must stay independently useful: `@goflag/cli`
audits any site, `@goflag/next` produces the HTML for one. `@goflag/og` is the remedy for the
two rules the auditor could only report — the share card, and the `.ico` container no Next
convention emits. A rule never reads raw HTML — it judges the `Extraction` model — and a rule
with no citable source states the question (`prose.ts`, `site-prose.ts`) instead of answering
it.

## Commands

| Goal                       | Command                                                                          |
| -------------------------- | -------------------------------------------------------------------------------- |
| Install                    | `corepack enable && pnpm install`                                                |
| Develop                    | `pnpm dev <url> [flags]` (CLI from source, tsx) · `pnpm dev:website` (port 3004) |
| Test                       | `pnpm test:unit` · `pnpm test:integration`                                       |
| Lint / typecheck           | `pnpm lint` · `pnpm typecheck` · `pnpm format:check`                             |
| Build                      | `pnpm build`                                                                     |
| Release                    | `pnpm release` / `pnpm release --dry-run`, on a branch cut off `develop`         |
| Audit the site with itself | `pnpm --filter @goflag/website seo`                                              |

`format` and `format:check` run once at the root over the whole repository; `build`,
`typecheck`, `test*` and `clean` fan out with `pnpm -r`; `lint` does both — root ESLint
first, then `pnpm -r --if-present lint`. To work on one package:
`pnpm --filter @goflag/cli test`.

`test:unit` needs no network and no browser. `test:integration` boots Hono fixture servers
and drives real Chromium. `playwright` is a devDependency of `packages/cli`, not of the root,
so install the browser from that package:
`pnpm --filter @goflag/cli exec playwright install chromium`.

The pnpm version is written once, in `packageManager`. Never add a
`corepack prepare pnpm@<x> --activate` line: it is a second number to keep in sync.

## Invariants

- **I1** — a published library's runtime depends on nothing: neither `packages/next` nor
  `packages/og` declares any `dependencies`, and `next` and `react` are peers.
- **I2** — goflag stays useful alone, on a site that does not use the library.
- **I3** — `packages/next` and `apps/**` must not import from `packages/cli`
  (eslint `no-restricted-imports`, `eslint.config.mjs`). Share by extracting a third package,
  never by reaching across.
- **I4** — a `@goflag/spec` package is extracted only once two real consumers want it.
- **I5** — the library's assumed scope is the Next.js App Router.
- **I6** — the catalogues are generated, not written: `packages/cli/rules.json` and
  `packages/cli/flags.json` come from the registries under `src/lib/rules/` and
  `src/lib/flags/`, and `catalog.test.ts` in each compares the committed file byte for byte.
  The pre-commit hook regenerates them; `--no-verify` skips the hook, never the test.
  `packages/cli/test/fixtures/transcripts/` joins them: the terminal output the site paints,
  the `preview.html` it serves, the fingerprint pairs it quotes, and the block injected between
  markers in `README.md` all come out of `generate-transcripts.ts` and are compared the same way.
- **I7** — a published visual is **derived or drawn, never transcribed**. Text the CLI prints is
  generated and compared byte for byte (I6). An image is a route prerendered at build
  (`/assets/[id]`, `/og/docs/[...slug]`) — an artefact that is not in git cannot go stale, which
  is why it needs no fingerprint and no `--check`. A diagram is a component, so its source _is_
  the artefact; where it asserts something the engine decides, a test reads that decision out of
  `packages/cli` by relative path and fails when the two disagree.
  Two exceptions, both with their reason written beside them: `public/favicon.ico`, because no
  Next convention emits an `.ico`; and the two OFL JetBrains Mono faces under
  `apps/website/src/lib/seo/fonts/`, because satori accepts neither a system face nor WOFF2 and
  `next/font` emits only WOFF2. Nothing else is committed as a binary — `.gitattributes` says so.

## Pitfalls

- `apps/website` reads `packages/cli/rules.json`, `packages/cli/flags.json` and both
  `CHANGELOG.md` by relative path at build time — it cannot import them (I3). That is why the
  Dockerfile copies the workspace root, and why `packages/cli/CHANGELOG.md` is listed by name
  in `deploy-develop`'s `changes:` rules.
- `renderDiffTerminal` reads a clock — `options.now ?? Date.now()` — and prints the baseline's
  age in whole days. Anything that renders it into a committed fixture must inject `now`, or the
  text changes at midnight UTC and the byte-for-byte test reddens on a tree nobody touched.
- The root `README.md` **is** the npm page for `@goflag/cli`: `prepack` stages it into the
  package. A relative link resolves against the repository on GitHub and against nothing on npm,
  so every link in it is absolute — `catalog.test.ts` fails on any that is not. Same reason the
  images it shows are absolute URLs on `goflag.tech` rather than repository paths.
- Never hand-edit the version pins in `README.md` or `apps/website/src/lib/constants.ts`:
  `pnpm release` rewrites both, and `constants.test.ts` fails until it has.
- `packages/cli/README.md` and `packages/cli/LICENSE` are copied from the repository root by
  `prepack` and are gitignored. Authoring them creates a second source of truth.
- `packages/next/src/locale/generated.ts` is enumerated from Node's ICU data — edit
  `packages/next/scripts/generate-locale-types.ts`, then
  `pnpm --filter @goflag/next generate:locales`.
- The `playwright` devDependency of `packages/cli` and the `mcr.microsoft.com/playwright:`
  image tag in `.gitlab-ci.yml` are one pin in two files. They must move together, or
  `chromium.executablePath()` points at a browser build that is not in the image.
- `pnpm-workspace.yaml` sets `minimumReleaseAge: 4320` — a dependency published in the last
  three days does not resolve at all, and no lockfile is written.
- `apps/website` refuses to build when `CI` or `APP_ENV=production` is set without
  `NEXT_PUBLIC_WEBSITE_FRONTEND_URL`. Locally the fallback applies, so a green local build
  proves nothing about that path.
- Tag the develop side of a merge, never the merge commit. A tag on a merge commit is
  unreachable from `develop`, `git describe` then finds nothing, and `commit-and-tag-version`
  replays the entire history into the changelog.
- `**/fixtures/**` is prettier-ignored on purpose — both `packages/cli/fixtures` and
  `packages/cli/test/fixtures`: captured verbatim, and compared byte for byte.

## Never do

- `git push --tags` and `git push --follow-tags`, from CI or by hand. GitLab declines the
  whole payload when any single ref in it is refused — on 2026-08-08 a rejected branch took
  two valid tags down with it. One ref per push.
- Pushing to `main` or `develop`. Both refuse a push from everyone, CI included; the version
  bump and the changelog land through a merge request like any other commit.
- Creating a `v*`, `next-v*` or `og-v*` tag by hand, or running `npm publish`. The `tag` job
  creates the tag; `publish:npm`, `publish:next` and `publish:og` trade a short-lived OIDC
  token for the right to publish. There is no npm credential in this repository to reuse.
  The one exception is a package's **first** version, which npm forces out by hand because a
  trusted publisher attaches to a package that already exists — `docs/publishing.md`.
- `kamal deploy` to production from a workstation, and `kamal proxy reboot` as part of a
  deploy — that proxy serves 80/443 for every app on the shared host.
- Reading or committing `.kamal/secrets-common`, or any `.env*`.

## Conventions

- Conventional Commits, scoped (`feat(cli):`, `fix(website):`, `chore(release):`). Subjects
  in this repository are declarative sentences, not imperatives.
- Branches are `feat/` · `fix/` · `chore/` · `ci/` · `docs/` plus a sentence-shaped slug.
  Everything merges into `develop`; merging `develop` into `main` is the decision to publish.
- Three tag namespaces, all protected: `v*` for `@goflag/cli`, `next-v*` for `@goflag/next`,
  `og-v*` for `@goflag/og`. A namespace has to be protected before its first release, or the
  `tag` job pushes a ref the remote refuses.
- `pnpm release` decides whether a version is spent: only a `feat`/`fix`/`perf`/breaking
  commit touching a package's declared **published surface** earns one, so a `fix(ci)` spends
  nothing.
- Comments here carry the reasoning at length, next to the code that needed it —
  `.gitlab-ci.yml`, `pnpm-workspace.yaml` and the husky hooks are the pattern. Removing a
  constraint means removing its paragraph too.
- `docs/*-plan.md` are authored design documents, not generated. Several carry counts and
  versions that are several releases stale; verify against the code before repeating one.
