/*
 * Visual regression harness route.
 *
 * Renders a single preview component against one of three canonical
 * fixtures, on a clean neutral background. Playwright navigates here for
 * each baseline screenshot in test/e2e/preview-vr.spec.ts.
 *
 * Query params:
 *   ?platform=PLATFORM_ID and ?fixture=FIXTURE_NAME
 *     - PLATFORM_ID is one of the entries in PREVIEW_PLATFORMS, e.g.
 *       facebook, x-card-summary-large, google-serp-mobile, ...
 *     - FIXTURE_NAME is one of: full, minimal, missing-image
 *
 * Not linked from the UI — only addressable directly. Excluded from the
 * coverage gate via vitest.config.ts (the page.tsx exclusion).
 */

import { notFound } from "next/navigation";
import {
  FIXTURE_NAMES,
  FIXTURE_PAGES,
  PREVIEW_COMPONENTS,
  PREVIEW_PLATFORMS,
  resolvePreview,
  type FixtureName,
  type PreviewPlatform,
} from "@/lib/previews";

interface SearchParams {
  platform?: string;
  fixture?: string;
}

export const dynamic = "force-dynamic";

export default async function PreviewFixturePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const platform = params.platform as PreviewPlatform | undefined;
  const fixture = params.fixture as FixtureName | undefined;

  if (
    !platform ||
    !fixture ||
    !PREVIEW_PLATFORMS.some((p) => p.id === platform) ||
    !FIXTURE_NAMES.includes(fixture)
  ) {
    notFound();
  }

  const page = FIXTURE_PAGES[fixture];
  const data = resolvePreview(platform, page);
  const Comp = PREVIEW_COMPONENTS[platform];

  return (
    <main className="bg-background flex min-h-screen items-center justify-center p-8">
      <div data-testid="vr-root" data-platform={platform} data-fixture={fixture}>
        <Comp data={data} page={page} />
      </div>
    </main>
  );
}
