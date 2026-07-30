import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "**/fixtures/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // Invariant I3, enforced rather than remembered.
    //
    // The library and the CLI are two products that must stay independently
    // useful: goflag has to work on a site that does not use `@goflag/next`,
    // and the library's runtime has to depend on nothing. A monorepo makes it
    // trivial to import "just this one helper" across that line, and the two
    // products quietly become one block — which is the failure this layout is
    // most exposed to.
    //
    // Sharing is not forbidden, it is deliberate: extract to a third package
    // both may depend on, and only once two consumers actually want it.
    files: ["packages/next/**/*.{ts,tsx}", "apps/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/packages/cli/**", "goflag/src/**"],
              message:
                "The library and apps must not reach into the CLI (invariant I3). Extract to a shared package if two consumers need it.",
            },
          ],
        },
      ],
    },
  },
);
