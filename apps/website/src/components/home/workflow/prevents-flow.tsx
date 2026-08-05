"use client";

import { Fragment } from "react";
import { useTranslations } from "next-intl";
import { motion, useReducedMotion } from "motion/react";
import {
  BadgeCheckIcon,
  ChevronRightIcon,
  EyeOffIcon,
  FlagIcon,
  RocketIcon,
  TagIcon,
  TrendingDownIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";

import { ArrowBottom, ArrowRight } from "@/components/shadcn-studio/blocks/hero-section-40/arrows";
import { WorkflowItem } from "@/components/shadcn-studio/blocks/hero-section-40/workflow-item";
import type { Step, StepIcon, Track } from "@/lib/workflow";
import { cn } from "@/lib/utils";

const ICON: Record<StepIcon, LucideIcon> = {
  tag: TagIcon,
  ship: RocketIcon,
  unseen: EyeOffIcon,
  falling: TrendingDownIcon,
  flag: FlagIcon,
  fix: WrenchIcon,
  clean: BadgeCheckIcon,
};

/** Each node lands a beat after the one before it, so the eye follows the story. */
const BEAT = 0.18;

/** Both tracks and the connector are laid out on this, which is what keeps them
 *  aligned: `grid-rows-2` gives two rows of genuinely equal height, so the
 *  connector's stubs meet the middle of each track without measuring anything. */
const TRACKS = "md:grid md:grid-rows-2";

/** The rules and the SVG arrows have to read as one drawing, so they share a
 *  colour rather than each picking a plausible grey. */
const RULE =
  "absolute border-[color-mix(in_oklab,var(--foreground)18%,var(--background))] dark:border-[color-mix(in_oklab,var(--foreground)28%,var(--background))]";

/**
 * The fork, drawn in CSS rather than as the hand-plotted SVG the source block
 * uses.
 *
 * `hero-section-40` positions every connector as an absolutely placed SVG whose
 * path coordinates are paired with a matching `md:mt-68`-style offset on the card
 * it points at. It looks superb and it cannot be edited: lengthen one line of
 * copy and the arrow lands in the middle of a card, with nothing to tell you
 * which of the two numbers is now wrong.
 *
 * Here the elbow is four rules positioned against the same two-row grid the
 * tracks use. Nothing is measured, so nothing can drift: the shared stub leaves
 * the origin at the boundary between the rows, which is where the origin card is
 * centred, and each branch stub sits at the middle of its own row.
 */
function ForkConnector() {
  const still = useReducedMotion();
  const grow = (axis: "x" | "y", delay: number) => ({
    initial: still ? undefined : { [`scale${axis.toUpperCase()}`]: 0 },
    animate: still ? undefined : { [`scale${axis.toUpperCase()}`]: 1 },
    transition: { duration: 0.35, ease: "easeInOut" as const, delay },
  });

  return (
    <div className={cn("relative w-10 shrink-0 max-md:hidden", TRACKS)} aria-hidden="true">
      <motion.span
        {...grow("x", 0)}
        className={cn(RULE, "top-1/2 left-0 w-1/2 origin-left border-t-2")}
      />
      <motion.span
        {...grow("y", 0.2)}
        className={cn(RULE, "top-1/4 bottom-1/4 left-1/2 border-l-2")}
      />

      <motion.span
        {...grow("x", BEAT * 2)}
        className={cn(RULE, "top-1/4 left-1/2 w-1/2 origin-left border-t-2")}
      />
      <motion.span
        {...grow("x", BEAT * 3)}
        className={cn(RULE, "top-3/4 left-1/2 w-1/2 origin-left border-t-2")}
      />

      <ChevronRightIcon className="absolute top-1/4 right-0 size-3.5 -translate-y-1/2 text-[color-mix(in_oklab,var(--foreground)28%,var(--background))] dark:text-[color-mix(in_oklab,var(--foreground)38%,var(--background))]" />
      <ChevronRightIcon className="absolute top-3/4 right-0 size-3.5 -translate-y-1/2 text-[color-mix(in_oklab,var(--foreground)28%,var(--background))] dark:text-[color-mix(in_oklab,var(--foreground)38%,var(--background))]" />
    </div>
  );
}

function TrackRow({ track, startBeat }: { track: Track; startBeat: number }) {
  const t = useTranslations(`home.workflow.prevents.${track.id}`);

  return (
    <div className="flex flex-col justify-center gap-2 md:py-1">
      <p className="text-muted-foreground flex items-center gap-2 font-mono text-[0.6875rem] tracking-widest uppercase">
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 rounded-full",
            track.tone === "cost" ? "bg-flag-red" : "bg-flag-green",
          )}
        />
        {t("label")}
      </p>

      <div className="flex flex-col md:flex-row md:items-center">
        {track.steps.map((step: Step, index) => (
          <Fragment key={step.id}>
            {index > 0 ? (
              <>
                <ArrowRight delay={startBeat + index * BEAT} />
                <ArrowBottom delay={startBeat + index * BEAT} />
              </>
            ) : null}
            <WorkflowItem
              kind={track.tone === "cost" ? "cost" : "caught"}
              label={t(`${step.id}.label`)}
              icon={ICON[step.icon]}
              title={t(`${step.id}.title`)}
              description={t(`${step.id}.detail`)}
              time={t(`${step.id}.time`)}
              delay={startBeat + index * BEAT}
              className="md:w-64"
            />
          </Fragment>
        ))}
      </div>
    </div>
  );
}

export function PreventsFlow({
  origin,
  tracks,
}: {
  origin: Step;
  tracks: readonly [Track, Track];
}) {
  const t = useTranslations(`home.workflow.prevents.${origin.id}`);

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-stretch">
      <div className="flex md:w-64 md:items-center">
        <WorkflowItem
          kind="trigger"
          label={t("label")}
          icon={ICON[origin.icon]}
          title={t("title")}
          description={t("detail")}
          time={t("time")}
        />
      </div>

      <ArrowBottom delay={BEAT} />
      <ForkConnector />

      <div className={cn("flex flex-1 flex-col gap-6 md:gap-0", TRACKS)}>
        {tracks.map((track, index) => (
          <TrackRow key={track.id} track={track} startBeat={BEAT * (index + 1)} />
        ))}
      </div>
    </div>
  );
}
