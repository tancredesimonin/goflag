import type { CSSProperties, ReactNode } from "react";
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
 *
 * Each card fades in on `.workflow-enter`, `delay` seconds after the diagram
 * mounts — a CSS animation, for the reason `globals.css` gives beside it.
 */

/** The inline style that staggers a `.workflow-*` entrance `delay` seconds in. */
export function beat(delay: number): CSSProperties | undefined {
  return delay ? { animationDelay: `${delay}s` } : undefined;
}

/**
 * The chip's colour comes from the track; its wording comes from the step.
 *
 * The washes are as light as they are because the label is 10px text and needs
 * 4.5:1 on them in the light theme, where it measured 4.39 on `bg-muted` and
 * 4.28 on a 16% emerald. At 50% and 10% they are 4.60 and 4.67. Red cannot get
 * there on any wash of itself (4.16 at 10%): red-600 is 4.83 on white to begin
 * with. Its track is the one faded out on purpose, so that is left as it is.
 */
const KIND = {
  /** The commit both timelines start from. Neutral: nothing has gone wrong yet. */
  trigger: "bg-[color-mix(in_oklab,var(--muted)50%,var(--background))] text-muted-foreground",
  /** The timeline nobody is watching. */
  cost: "bg-[color-mix(in_oklab,var(--flag-red)10%,var(--background))] text-flag-red",
  /** The timeline goflag puts you on. */
  caught: "bg-[color-mix(in_oklab,var(--flag-green)10%,var(--background))] text-flag-green",
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
  return (
    <div className={cn("workflow-enter relative z-1 w-full pt-6", className)} style={beat(delay)}>
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
    </div>
  );
}
