# @goflag/next changelog

All notable changes to this package will be documented in this file. See [Conventional Commits](https://www.conventionalcommits.org/) for commit guidelines.

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
