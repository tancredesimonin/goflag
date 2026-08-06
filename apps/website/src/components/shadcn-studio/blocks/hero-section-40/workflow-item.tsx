"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The node of a workflow diagram, from shadcn/studio's `hero-section-40`: a
 * coloured kind chip tucked behind a card, an icon, a title, a line of prose and
 * an elapsed time.
 *
 * What the original also carries has been dropped rather than restyled — a
 * dropdown with Share / Update / Refresh, an Approve button, a "GPT-4-1 Mini"
 * badge, logo chips for Slack and Gmail. All of it is furniture for a screenshot
 * of a product that does not exist, and on a page whose argument is that it
 * reports facts, inventing an interface is the one thing worth avoiding.
 *
 * The elapsed time is the opposite: the original's least prominent detail is the
 * whole point here. goflag's case is about *when* you find out, so the badge
 * carries the argument and is the only thing on the card allowed to say
 * "months later".
 */

/** The chip's colour comes from the track; its wording comes from the step. */
const KIND = {
  /** The commit both timelines start from. Neutral: nothing has gone wrong yet. */
  trigger: "bg-muted text-muted-foreground",
  /** The timeline nobody is watching. */
  cost: "bg-[color-mix(in_oklab,var(--flag-red)16%,var(--background))] text-flag-red",
  /** The timeline goflag puts you on. */
  caught: "bg-[color-mix(in_oklab,var(--flag-green)16%,var(--background))] text-flag-green",
} as const;

export type WorkflowKind = keyof typeof KIND;

export function WorkflowItem({
  kind,
  label,
  icon: Icon,
  title,
  description,
  time,
  delay = 0,
  className,
  children,
}: {
  kind: WorkflowKind;
  label: string;
  icon: LucideIcon;
  title: string;
  /** One line of prose under the title. The prevents diagram omits it in
   *  favour of a small visual mockup passed as `children`. */
  description?: string;
  time: string;
  delay?: number;
  className?: string;
  children?: ReactNode;
}) {
  const still = useReducedMotion();

  return (
    <motion.div
      initial={still ? undefined : { opacity: 0, y: 8 }}
      animate={still ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut", delay }}
      className={cn("relative z-1 w-full pt-6", className)}
    >
      <div
        className={cn(
          "absolute top-0 left-0 -z-1 flex items-center gap-1.5 rounded-t-lg px-2.5 pt-1 pb-4 font-mono text-[0.625rem] tracking-widest uppercase",
          KIND[kind],
        )}
      >
        <Icon className="size-3" aria-hidden="true" />
        {label}
      </div>

      <div className="bg-card text-card-foreground relative z-1 flex flex-col gap-1 rounded-xl border p-3.5 shadow-sm">
        {/* The heading needs its size stated. Marketing sections carry the
            `editorial` class, which gives a bare `h3` a serif display size — right
            for a section heading and three times too tall for a node in a
            diagram. */}
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm leading-snug font-medium text-balance">{title}</h3>
          <span className="text-muted-foreground shrink-0 font-mono text-[0.6875rem] whitespace-nowrap">
            {time}
          </span>
        </div>

        {description ? (
          <p className="text-muted-foreground text-xs leading-snug text-balance">{description}</p>
        ) : null}

        {children}
      </div>
    </motion.div>
  );
}
