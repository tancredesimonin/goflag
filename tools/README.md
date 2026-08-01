# tools/

Published artefacts that are not products.

Deliberately outside the `packages/*` and `apps/*` globs in
`pnpm-workspace.yaml`: nothing here is built, tested, versioned or released by
the workspace scripts, and a release script iterating over packages must not
pick any of it up. Tracked here rather than published from a scratch directory
so that what is on npm under our names is reviewable.

## `name-holder/`

Holds the bare `goflag` name on npm, pointing at `@goflag/cli`. Published once,
by hand, and deprecated immediately afterwards so npm shows the redirection in
its own UI:

```sh
cd tools/name-holder && npm publish --access public
npm deprecate goflag "goflag ships as @goflag/cli — run: npm i @goflag/cli"
```

It carries no code and no `bin` on purpose. A package that silently installed
something other than what its name says would be worse than one that says where
to go.
