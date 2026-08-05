/**
 * Facts about the published package that the site quotes in more than one
 * place. `CLI_VERSION` is the version every install snippet pins to, so it has
 * to be bumped here — and only here — when a release lands.
 */
export const SITE = {
  name: "goflag",
  domain: "goflag.tech",
  email: "hello@goflag.tech",
  tagline: "Flags the site problems humans can't catch at scale.",
} as const;

export const PACKAGE = {
  name: "@goflag/cli",
  bin: "goflag",
  version: "0.1.4",
  npm: "https://www.npmjs.com/package/@goflag/cli",
  repo: "https://github.com/tancredesimonin/goflag",
  issues: "https://github.com/tancredesimonin/goflag/issues",
  /**
   * Whether that repository answers to a stranger.
   *
   * The canonical project is a private GitLab one and the GitHub mirror is not
   * published yet, so every link to it currently 404s — including the commit and
   * compare links `commit-and-tag-version` writes into the changelog. Until the
   * mirror exists, the site prints commit SHAs as text and hides the repository
   * links rather than shipping the broken-link class of defect it reports on.
   * Flip this to `true` the day the mirror goes public; nothing else changes.
   */
  repoPublic: false,
  license: "MIT",
  nodeRange: ">=20.11",
} as const;

export const INSTALL = {
  tryIt: `npx ${PACKAGE.name} https://example.com`,
  addDev: `pnpm add -D ${PACKAGE.name}`,
  pinned: `npx --yes "${PACKAGE.name}@${PACKAGE.version}"`,
} as const;

/**
 * Numbers used as proof on the landing page. Every one of them is measured and
 * recorded in the repository — `docs/spec-and-lib-plan.md` for the audit
 * timings and the false positives, the test suite for the count. Nothing here
 * is rounded up for effect; if a figure cannot be sourced it does not belong
 * on the page.
 */
export const PROOF = {
  pageRules: 11,
  siteRules: 3,
  tests: 516,
  sitesGated: 4,
  largestSitePages: 456,
  largestSiteDuration: "4 min",
  falsePositivesFound: 5,
} as const;
