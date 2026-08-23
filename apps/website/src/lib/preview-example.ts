import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The frozen `goflag preview` example, read from the file `packages/cli`
 * generates.
 *
 * `/docs/preview` opens on "It needs an eye" and then describes seven social
 * surfaces for a hundred and thirty lines without showing one. This is the eye.
 *
 * Read rather than rendered: `renderPreview` lives in `@goflag/cli`, which this
 * app cannot import (invariant I3), so the file is produced over there by
 * `pnpm --filter @goflag/cli generate:transcripts`, compared to the renderer
 * byte for byte by `preview-fixture.test.ts`, and picked up here by relative
 * path — the same escape hatch `rules-catalog.ts` and `transcripts.ts` use.
 *
 * Two things about it that are deliberate and would otherwise read as bugs:
 *
 * It audits `openfinanceguide.com`, not this site and not `example.com`. A
 * reserved domain answers nothing, so every card would draw its empty state.
 * Every `<head>` in the corpus is a faithful mirror of what that site actually
 * served, because the findings on the cards are derived by the real rule
 * registry — an invented tag would publish a false claim about a live origin.
 *
 * And it is dated. The document's footer prints the report's `finishedAt`, so
 * the example says "audited 2026-08-20" for as long as it stands. That is what
 * a frozen example is; the page that links to it says so.
 */

const PATH = join(
  process.cwd(),
  "..",
  "..",
  "packages",
  "cli",
  "test",
  "fixtures",
  "transcripts",
  "preview.html",
);

export const PREVIEW_EXAMPLE = readFileSync(PATH, "utf8");

/** For the sentence that tells a reader what they are about to open. */
export const PREVIEW_EXAMPLE_BYTES = Buffer.byteLength(PREVIEW_EXAMPLE, "utf8");
