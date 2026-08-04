import next from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * React and Next-specific rules for the website.
 *
 * The repository root already lints `apps/**` — that is where invariant I3
 * lives, the rule that stops an app importing from `packages/cli`. This config
 * adds only what the root cannot: the React and Next plugins. Root `pnpm lint`
 * chains into it via `pnpm -r --if-present lint`.
 */
const config = [
  {
    ignores: [".next/**", ".content-collections/**", "next-env.d.ts"],
  },
  ...next,
  ...nextTypescript,
];

export default config;
