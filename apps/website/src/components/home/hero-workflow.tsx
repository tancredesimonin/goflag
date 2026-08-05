import { ArrowRightIcon } from "lucide-react";
import NextLink from "next/link";
import { getTranslations } from "next-intl/server";

import { WorkflowTabs } from "@/components/home/workflow/workflow-tabs";
import { CopyCommand } from "@/components/site/copy-command";
import { Button } from "@/components/ui/button";
import { INSTALL } from "@/lib/constants";

/**
 * The hero as a diagram of the tool rather than a screenshot of it.
 *
 * Adapted from a shadcn/studio block whose good idea is the switcher: five
 * capabilities, one click apart, each drawn as input → check → output. What it
 * replaces is a single terminal panel, which showed the output convincingly and
 * the mechanism not at all — a reader who does not already trust a link checker
 * in CI needs to see what it actually does before they will believe the verdict.
 *
 * Everything above the switcher is a server component and ships in the HTML.
 * Only the tab selection is client-side, and no panel starts invisible, so the
 * headline and the copy survive with JavaScript off.
 */
export async function HeroWorkflow() {
  const t = await getTranslations("home.hero");

  return (
    <section className="relative overflow-hidden border-b">
      {/* Weighted to the bottom, where the diagram is: texture reads as a canvas
          under the cards, and as noise behind a headline. */}
      <div className="bg-dots pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_bottom,black,transparent_70%)]" />

      {/* Everything between the headline and the first tab is spend against a
          three-second budget: the reader has to take in the problem, the fix, the
          command and one worked example before deciding to stay. What used to sit
          in here and no longer does — a badge of licence and Node version, a label
          over a command that already starts with `$`, a caption over five tabs
          that name themselves — was all true and none of it was worth a line. */}
      <div className="relative mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
          <h1 className="text-4xl font-semibold text-balance sm:text-5xl lg:text-[3.4rem] lg:leading-[1.08]">
            {t("title")}
          </h1>

          {/* `<head>` cannot be written literally in a message: next-intl parses
              angle brackets as rich-text tags and throws when no handler matches.
              The brackets belong to the renderer anyway — a translator should see
              an element name they must not touch, not markup they might. */}
          <p className="text-muted-foreground text-lg leading-relaxed text-pretty">
            {t.rich("lead", {
              code: (chunks) => (
                <code className="text-foreground font-mono text-[0.95em]">&lt;{chunks}&gt;</code>
              ),
            })}
          </p>

          <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <div className="w-full max-w-md">
              <CopyCommand
                command={INSTALL.tryIt}
                copyLabel={t("copy")}
                copiedLabel={t("copied")}
              />
            </div>
            <Button size="lg" variant="ghost" asChild className="shrink-0">
              <NextLink href="/docs/quickstart">
                {t("docsCta")}
                <ArrowRightIcon />
              </NextLink>
            </Button>
          </div>
        </div>

        <WorkflowTabs label={t("workflowLabel")} />
      </div>
    </section>
  );
}
