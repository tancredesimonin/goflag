import { ImageResponse } from "next/og";

import {
  MONO_BOLD,
  MONO_REGULAR,
  TerminalImage,
  terminalImageSize,
  type TerminalImageSpec,
} from "@/lib/seo/terminal-image";

/**
 * Images for the surfaces that cannot render HTML — the README, which `prepack`
 * copies into the package and npm publishes, and anywhere else a link is
 * pasted rather than followed.
 *
 * ## Prerendered, not committed
 *
 * `force-static` plus `generateStaticParams` means every image below is built
 * with the site and served as a static asset. None of them is a file in git,
 * which is the whole reason this is a route rather than a `pnpm run` writing
 * PNGs into `public/`: an artefact that does not exist in the repository cannot
 * go stale, needs no fingerprint, no `--check`, and no line in the `check:`
 * job. Every deploy rebuilds it from the transcript and the stylesheet.
 *
 * The exception that proves it is `favicon.ico`, which stays committed because
 * no Next convention emits an `.ico` — the precondition none of these meet.
 *
 * ## Why the ids carry an extension
 *
 * `proxy.ts:70` rewrites what it matches under a locale, and its matcher ends
 * in a `.*\..*` negation. `cover.png` falls out of the matcher on its own; a
 * bare `cover` would be rewritten to `/en/assets/cover` and 404 — the defect
 * that put `og` and `apple-icon` in that exclusion list by name.
 *
 * The extension is also what the README needs: a link ending in `.png` is what
 * GitHub's image proxy and npm's renderer will fetch as an image.
 */
export const dynamic = "force-static";

/**
 * A slice is 1-based and inclusive, and can only narrow a transcript that has
 * already been compared to the renderer byte for byte. `hero` is the first
 * eleven lines of the full report — the verdict, the counters and the broken
 * links — because the whole thing is 32 lines and the point of the image is to
 * be readable above the fold on a package page.
 */
const TERMINALS: Record<string, TerminalImageSpec> = {
  "hero.png": { id: "full", lines: [1, 11] },
};

/**
 * One image, because one thing consumes one image.
 *
 * A first draft also served `gate.png`, `summary.png` and a `cover.png` built
 * from `og.card`. None of them had a caller: the README quotes the gate as text
 * already — a fence and a picture of the same eleven lines is one of them too
 * many — and GitHub draws its own social preview for a repository, so the cover
 * would have been rendered on every deploy for nobody. A route that nothing
 * calls is what `HERO_REPORT` was, and registering `Figure` with no figure was
 * refused on the same grounds a commit earlier.
 *
 * Adding one back is a two-line change on the day something asks for it.
 */
export function generateStaticParams() {
  return Object.keys(TERMINALS).map((id) => ({ id }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const spec = TERMINALS[id];
  if (!spec) {
    return new Response("Not found\n", { status: 404, headers: { "content-type": "text/plain" } });
  }

  return new ImageResponse(<TerminalImage spec={spec} />, {
    ...terminalImageSize(spec),
    fonts: [
      { name: "JetBrains Mono", data: MONO_REGULAR, weight: 400, style: "normal" },
      { name: "JetBrains Mono", data: MONO_BOLD, weight: 700, style: "normal" },
    ],
  });
}
