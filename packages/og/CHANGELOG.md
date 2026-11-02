# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [0.3.0](https://github.com/tancredesimonin/goflag/compare/og-v0.2.0...og-v0.3.0) (2026-11-02)


### ⚠ BREAKING CHANGES

* **og:** `ogIcon().render` returns a promise, so a direct caller has to
await it. Next awaits a default export, so `export default icon.render` is
unaffected.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

### Features

* **og:** a card takes the site's fonts and can draw its accent ([ffc0e6c](https://github.com/tancredesimonin/goflag/commit/ffc0e6ccd96088ad0da097eebb253d10adf83a58))


### Bug Fixes

* **deps:** next moves to 16.3.8, past GHSA-cjq9-62q9-8jv4 ([5ddcd4b](https://github.com/tancredesimonin/goflag/commit/5ddcd4bcb6ccc44c5627c8ba0def5f54e76318a3))
* **deps:** next moves to 16.4.2, past two critical RCEs ([00bdd4f](https://github.com/tancredesimonin/goflag/commit/00bdd4f4046c3af4d2f8f50d67a6f72befc7dd6c))
* **deps:** update dependencies ([9f3ba6f](https://github.com/tancredesimonin/goflag/commit/9f3ba6fc599bedb54258cf57f88aa35ff97a1e31))
* **deps:** update dependencies ([9e84198](https://github.com/tancredesimonin/goflag/commit/9e8419840e5ea0fa09070bfe1a1ea573b2ff3dc8))
* **deps:** update dependencies ([9f1c9ca](https://github.com/tancredesimonin/goflag/commit/9f1c9cab9bc97e1d5b05fed8e97b44d425a9549a))
* **deps:** update dependencies ([14d6167](https://github.com/tancredesimonin/goflag/commit/14d6167801fa24116214c40fbdbb8811a80cdc19))
* **deps:** update dependencies ([6d967f4](https://github.com/tancredesimonin/goflag/commit/6d967f446095c92606132496d9d2ac01776df442))
* **deps:** update dependencies ([a34b7da](https://github.com/tancredesimonin/goflag/commit/a34b7dad2b8f0767e3abe5f93496bdd179513455))
* **deps:** update dependencies ([4a2acea](https://github.com/tancredesimonin/goflag/commit/4a2acea31af197832c1a2896172156cfe6f79560))
* **deps:** update dependencies ([823b6e5](https://github.com/tancredesimonin/goflag/commit/823b6e5a2988d3f3b78896c2b222cbbb20d5a891))
* **deps:** update dependencies ([8121674](https://github.com/tancredesimonin/goflag/commit/8121674f87f0621be5850d6cfe5717109f781350))

## [0.2.0](https://github.com/tancredesimonin/goflag/compare/og-v0.1.0...og-v0.2.0) (2026-08-16)


### ⚠ BREAKING CHANGES

* **og:** the package keeps only what something calls

* **og:** the package keeps only what something calls ([8e185ae](https://github.com/tancredesimonin/goflag/commit/8e185aed41b65573744b8c84f436a45b2d8c4315))
