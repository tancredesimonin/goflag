/**
 * Facts about the published packages that the site quotes in more than one
 * place. `PACKAGE.version` is what every install snippet pins to, so it has to
 * be bumped here, and only here, when a release lands.
 *
 * It is a literal rather than a read of `packages/cli/package.json` because
 * this module reaches components, and a `node:fs` call in it would make every
 * one of them server-only for the sake of one string. `constants.test.ts`
 * carries the honesty instead: it fails when the number here stops matching
 * the manifest, which is how it went three releases stale.
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
  version: "0.2.11",
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
  nodeRange: ">=22",
} as const;

/**
 * The other half of the project: the library that produces what the CLI audits.
 *
 * Deliberately thinner than `PACKAGE`. The site is the CLI's shop window, and
 * the library is documented rather than sold, so it needs a name, a version and
 * somewhere to click. Anything more would be a second product on a page that
 * has one.
 */
export const LIB = {
  name: "@goflag/next",
  version: "0.3.3",
  npm: "https://www.npmjs.com/package/@goflag/next",
  docs: "/docs/next",
} as const;

export const INSTALL = {
  tryIt: `npx ${PACKAGE.name} https://example.com`,
  addDev: `pnpm add -D ${PACKAGE.name}`,
  pinned: `pnpm dlx ${PACKAGE.name}@${PACKAGE.version}`,
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
  tests: 686,
  sitesGated: 4,
  largestSitePages: 456,
  largestSiteDuration: "4 min",
  falsePositivesFound: 5,
} as const;
