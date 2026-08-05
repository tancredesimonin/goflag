"use client";

import { Fragment, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { motion, useReducedMotion } from "motion/react";
import {
  BadgeCheckIcon,
  CheckIcon,
  ChevronRightIcon,
  EyeOffIcon,
  FlagIcon,
  ImageIcon,
  RocketIcon,
  TagIcon,
  TrendingDownIcon,
  WrenchIcon,
  XIcon,
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

/** A row of CI job results, the shorthand every developer already reads. */
function Pipeline({ jobs, failed }: { jobs: readonly string[]; failed?: string }) {
  return (
    <div
      aria-hidden="true"
      className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[0.625rem]"
    >
      {jobs.map((job) => (
        <span key={job} className="text-flag-green flex items-center gap-1">
          <CheckIcon className="size-2.5 shrink-0" strokeWidth={3} />
          {job}
        </span>
      ))}
      {failed ? (
        <span className="text-flag-red flex items-center gap-1">
          <XIcon className="size-2.5 shrink-0" strokeWidth={3} />
          {failed}
        </span>
      ) : null}
    </div>
  );
}

/** A two-line mono snippet in the site's terminal palette. */
function Snippet({ lines }: { lines: readonly ReactNode[] }) {
  return (
    <div
      aria-hidden="true"
      className="bg-terminal text-terminal-foreground border-terminal-border mt-1.5 overflow-hidden rounded-md border px-2 py-1.5 font-mono text-[0.625rem] leading-relaxed whitespace-nowrap"
    >
      {lines.map((line, index) => (
        <div key={index}>{line}</div>
      ))}
    </div>
  );
}

/**
 * What each card shows instead of a line of prose: a thumbnail of the moment.
 * Markup, identifiers and CI job names stay verbatim in every locale — the
 * same rule as the stage diagrams — so these live in code, not the catalogues.
 */
const MOCKUPS: Record<StepIcon, ReactNode> = {
  /* One line in the head changes; the page still renders. */
  tag: (
    <Snippet
      lines={[
        <span key="l1" className="opacity-60">
          {'<link rel="canonical"'}
        </span>,
        <span key="l2">
          <span className="opacity-60">{"  href="}</span>
          <span className="text-flag-yellow">{'"/another-page"'}</span>
          <span className="opacity-60">{" />"}</span>
        </span>,
      ]}
    />
  ),

  /* Every check was green; nothing had a reason to fail. */
  ship: <Pipeline jobs={["build", "tests", "deploy"]} />,

  /* The search results, with the slot where your page used to be. */
  unseen: (
    <div aria-hidden="true" className="mt-2 flex flex-col gap-1.5">
      <div className="bg-muted-foreground/25 h-1.5 w-3/4 rounded-full" />
      <div className="border-muted-foreground/40 h-2 w-2/3 rounded-full border border-dashed" />
      <div className="bg-muted-foreground/25 h-1.5 w-4/5 rounded-full" />
    </div>
  ),

  /* The traffic curve, read months too late. */
  falling: (
    <svg
      viewBox="0 0 96 24"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="mt-1.5 h-6 w-full"
    >
      <polyline
        points="0,5 20,7 38,8 54,12 70,19 96,22"
        fill="none"
        stroke="var(--flag-red)"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  ),

  /* The same pipeline, one job further. */
  flag: <Pipeline jobs={["build", "tests"]} failed="goflag" />,

  /* The finding names the tag; the fix is a one-line diff. */
  fix: (
    <Snippet
      lines={[
        <span key="del" className="text-flag-red">
          {'- href="/another-page"'}
        </span>,
        <span key="add" className="text-flag-green">
          {'+ href="/pricing"'}
        </span>,
      ]}
    />
  ),

  /* Indexed, and the shared link renders its preview card. */
  clean: (
    <div
      aria-hidden="true"
      className="bg-background mt-1.5 flex items-center gap-2 rounded-md border p-1.5"
    >
      <div className="bg-flag-green/15 flex size-7 shrink-0 items-center justify-center rounded">
        <ImageIcon className="text-flag-green size-3.5" />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="bg-foreground/40 h-1.5 w-24 rounded-full" />
        <div className="bg-muted-foreground/30 h-1.5 w-16 rounded-full" />
      </div>
      <CheckIcon className="text-flag-green ml-auto size-3.5 shrink-0" strokeWidth={3} />
    </div>
  ),
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
    <div
      className={cn(
        "flex flex-col justify-center gap-2 md:py-1",
        /* The timeline nobody is watching is literally faded out; the clean
           process reads at full strength. Hover brings it back for a close read. */
        track.tone === "cost" &&
          "opacity-55 transition-opacity duration-300 hover:opacity-100 focus-within:opacity-100",
      )}
    >
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
              time={t(`${step.id}.time`)}
              delay={startBeat + index * BEAT}
              className="md:w-64"
            >
              {MOCKUPS[step.icon]}
            </WorkflowItem>
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
          time={t("time")}
        >
          {MOCKUPS[origin.icon]}
        </WorkflowItem>
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
