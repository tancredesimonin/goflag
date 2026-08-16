"use client";

import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

/**
 * The connectors from shadcn/studio's `hero-section-40`, kept as two exports
 * rather than the two files they ship as.
 *
 * Two changes to the originals. They honour `prefers-reduced-motion`, which the
 * block does not: a stroke that draws itself is decoration, and a reader who has
 * asked the system for less of that should get the finished line immediately
 * rather than a shorter animation. And the diamond, the stroke and the head are
 * one `motion.g` on a shared timeline instead of three independently delayed
 * paths, so a change of pace is one number rather than three that have to stay
 * in a fixed relationship.
 */

const STROKE = "color-mix(in oklab,var(--foreground)18%,var(--background))";
const STROKE_DARK =
  "dark:stroke-[color-mix(in_oklab,var(--foreground)28%,var(--background))] dark:fill-[color-mix(in_oklab,var(--foreground)28%,var(--background))]";

function useDraw(delay: number) {
  const still = useReducedMotion();

  return {
    initial: still ? undefined : { pathLength: 0, opacity: 0 },
    animate: still ? undefined : { pathLength: 1, opacity: 1 },
    transition: { duration: 0.45, ease: "easeInOut" as const, delay },
  };
}

export function ArrowRight({ delay = 0, className }: { delay?: number; className?: string }) {
  const draw = useDraw(delay);

  return (
    <svg
      width="71"
      height="15"
      viewBox="0 0 71 15"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0 max-md:hidden", className)}
    >
      <motion.g {...draw} stroke={STROKE} fill={STROKE} className={STROKE_DARK}>
        <path d="M6 1.36L12 7.36L6 13.36L0 7.36L6 1.36Z" strokeWidth="0" />
        <path d="M6 7.36H70" strokeWidth="2" />
        <path
          d="M63.49 1L69.88 7.36L63.49 13.72"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </motion.g>
    </svg>
  );
}

export function ArrowBottom({ delay = 0, className }: { delay?: number; className?: string }) {
  const draw = useDraw(delay);

  return (
    <svg
      width="15"
      height="44"
      viewBox="0 0 15 44"
      fill="none"
      aria-hidden="true"
      className={cn("mx-auto shrink-0 md:hidden", className)}
    >
      <motion.g {...draw} stroke={STROKE} fill={STROKE} className={STROKE_DARK}>
        <path d="M13.36 6L7.36 12L1.36 6L7.36 0L13.36 6Z" strokeWidth="0" />
        <path d="M7.36 6V43" strokeWidth="2" />
        <path
          d="M13.72 36.5L7.36 42.88L1 36.5"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </motion.g>
    </svg>
  );
}
