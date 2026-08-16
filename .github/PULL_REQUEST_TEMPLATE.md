<!--
  Read this before spending time on the description below.

  GitHub is a read-only mirror of this project. The canonical repository is on
  GitLab, and so is the CI that tests, tags and publishes every release.

  A pull request opened here cannot be merged: nothing on GitHub triggers a
  pipeline, and a commit that landed here would be overwritten by the next
  mirror push. That is a limit of the mirror, not a judgement on the change.

  Two ways forward, both of which end with your work in the project:

    1. Open the merge request on GitLab, if you have access.
    2. Open an ISSUE here with the diff or a patch attached. It will be carried
       over with attribution.

  Sorry for the detour, and thank you for the change.

  See CONTRIBUTING.md for the whole story.
-->

## What this changes

<!-- One sentence. The commit subject is usually already it. -->

## Why

<!-- The finding, the bug, or the source that requires it. For a rule change:
     who requires this, and where do they say so. -->

## Checks

- [ ] `pnpm lint && pnpm typecheck && pnpm format:check`
- [ ] `pnpm test:unit`
- [ ] `pnpm test:integration`, if the change touches crawling, fetching or extraction
- [ ] Conventional Commit subject, scoped (`feat(cli):`, `fix(website):`)
- [ ] Read [AGENTS.md](../AGENTS.md) if this is a first change here
