# @goflag/next changelog

All notable changes to this package will be documented in this file. See [Conventional Commits](https://www.conventionalcommits.org/) for commit guidelines.

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
