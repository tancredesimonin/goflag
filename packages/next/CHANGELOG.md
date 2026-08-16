# @goflag/next changelog

All notable changes to this package will be documented in this file. See [Conventional Commits](https://www.conventionalcommits.org/) for commit guidelines.

## [0.4.0](https://github.com/tancredesimonin/goflag/compare/next-v0.3.3...next-v0.4.0) (2026-08-16)


### ⚠ BREAKING CHANGES

* **next:** `routes.metadata({ image })` no longer emits `og:image:alt`
derived from the page title. Pass `imageAlt` beside `image` to keep the tag;
without it the tag is omitted, which is what `og.image.alt` is there to
report. The title was never a valid value — the protocol asks for what is in
the image and excludes a caption — and because it satisfied the presence
check, no audit could ever say so.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
* **next:** the library declares only what it was told about an image

### Features

* **next:** the library declares only what it was told about an image ([d5eab4c](https://github.com/tancredesimonin/goflag/commit/d5eab4c2d297412b73eca2d700c7fd83a92c8762))


### Bug Fixes

* **next:** a title is a caption, so it is not an og:image:alt ([e237dc3](https://github.com/tancredesimonin/goflag/commit/e237dc3a74e54be4e6c782a12ef19c731b62b6f0))
* **next:** the test reads the first image without indexing a union ([c565fac](https://github.com/tancredesimonin/goflag/commit/c565fac9eafcdd3bdbec91da303cdbb31c7c04e5))
* **release:** a release is decided on the package that moved ([7cb9dac](https://github.com/tancredesimonin/goflag/commit/7cb9dac7c4e7d601b769670ccbdffb118efeff40))


### Documentation

* **next:** og:image:alt stopped defaulting, and nothing said so ([4f61483](https://github.com/tancredesimonin/goflag/commit/4f61483053708ba845f08c1f97dc0c9874b96467))

## [0.3.3](https://github.com/tancredesimonin/goflag/compare/next-v0.3.2...next-v0.3.3) (2026-08-15)


### Features

* **next:** say the cluster in both vocabularies, and describe the card ([6f5fbd3](https://github.com/tancredesimonin/goflag/commit/6f5fbd3093f307557fa73f46d04eeec2d726ccc0))

## [0.3.2](https://github.com/tancredesimonin/goflag/compare/next-v0.3.1...next-v0.3.2) (2026-08-13)


### Features

* **next:** let a collection say which entries are one page ([e7cdf90](https://github.com/tancredesimonin/goflag/commit/e7cdf904270a12a676b7473e4dc83dc0138cdd32))

## [0.3.1](https://github.com/tancredesimonin/goflag/compare/next-v0.3.0...next-v0.3.1) (2026-08-13)


### Documentation

* correct what the documentation says the CLI does ([7bc8aeb](https://github.com/tancredesimonin/goflag/commit/7bc8aeb6510567482872ce1c273f837cd08bbf0a))
* correct what this session's own documentation got wrong ([25b8c3a](https://github.com/tancredesimonin/goflag/commit/25b8c3ad98a3dde57180a843efc5660629cbd3d1))

## 0.3.0 (2026-08-09)


### Features

* **next:** let a route be declared without being listed ([6aa12f8](https://github.com/tancredesimonin/goflag/commit/6aa12f86473133d44f0859bf905be0e8f9f5579e))


## 0.2.0 (2026-08-08)


### ⚠ BREAKING CHANGES

* **next:** `locales` refuses tags naming no real language or region;
`bcp47()` returns the canonical case rather than the declared string; and
`localeTags.openGraph` becomes unnecessary rather than required.

### Features

* **next:** add @goflag/next, the route registry ([c762983](https://github.com/tancredesimonin/goflag/commit/c7629834c26ed32e7828213836ebff751e674b25))
* **next:** derive every locale form from ICU, validate against it ([9948f92](https://github.com/tancredesimonin/goflag/commit/9948f920bdfc1b28216305f3cbc5ffdc755cabe2))
* **next:** sitemap facts per route, and robots that keeps quiet ([bfa3dd4](https://github.com/tancredesimonin/goflag/commit/bfa3dd42e18401595a5ad53dafd40ea8bf3b6389))


### Bug Fixes

* **next:** emit the locale tag the site declared, do not re-case it ([de1b725](https://github.com/tancredesimonin/goflag/commit/de1b72571545b37eedee4f5369998212970ee22d))
* **next:** the manifest must say what npm says, not what comes next ([bf32069](https://github.com/tancredesimonin/goflag/commit/bf32069336f540f957a6680f0e7df45a4c869e79))


### Documentation

* a runbook for the one step that cannot be automated ([a1dd9f9](https://github.com/tancredesimonin/goflag/commit/a1dd9f9f061b6fd8326d6fb852f669ba8db0fc74))
