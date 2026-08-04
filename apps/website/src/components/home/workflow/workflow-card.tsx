import { BracesIcon, CirclePlayIcon, FileInputIcon } from "lucide-react";

import type { Stage, StageRow } from "@/lib/workflow";
import { cn } from "@/lib/utils";

/**
 * The three stage kinds are deliberately not colour-coded.
 *
 * The block this is adapted from tints each stage — sky for input, amber for
 * action, green for output — which reads well on a generic template and would be
 * a mistake here. On this site amber means warning and red means error, so
 * spending those hues on "this is the middle step" would leave the actual
 * severities competing with decoration. The machinery is neutral; the only
 * colour in the diagram is a finding's own tone.
 */
const KIND = {
  input: { label: "input", icon: FileInputIcon },
  work: { label: "check", icon: CirclePlayIcon },
  output: { label: "output", icon: BracesIcon },
} as const;

const TONE_TEXT = {
  green: "text-flag-green",
  yellow: "text-flag-yellow",
  red: "text-flag-red",
} as const;

const TONE_DOT = {
  green: "bg-flag-green",
  yellow: "bg-flag-yellow",
  red: "bg-flag-red",
} as const;

function Row({ row }: { row: StageRow }) {
  return (
    <li className="flex items-start gap-2">
      <span
        aria-hidden="true"
        className={cn(
          "mt-1.75 size-1.5 shrink-0 rounded-full",
          row.tone ? TONE_DOT[row.tone] : "bg-muted-foreground/40",
        )}
      />
      <span
        className={cn(
          row.code ? "font-mono text-xs leading-relaxed" : "text-sm leading-relaxed",
          row.tone ? TONE_TEXT[row.tone] : "text-muted-foreground",
        )}
      >
        {row.text}
      </span>
    </li>
  );
}

export function WorkflowCard({ stage, className }: { stage: Stage; className?: string }) {
  const { label, icon: Icon } = KIND[stage.kind];

  return (
    <div className={cn("relative flex h-full flex-col pt-7", className)}>
      {/* Tucked behind the card so only the tab shows, which is the one device
          worth keeping verbatim from the original block. */}
      <div className="bg-muted text-muted-foreground absolute top-0 left-0 -z-1 flex items-center gap-2 rounded-t-xl px-3 pt-1.5 pb-5 font-mono text-[0.6875rem] tracking-widest uppercase">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </div>

      <div className="bg-card relative z-1 flex flex-1 flex-col gap-3 rounded-xl border p-4 shadow-sm">
        <div className="flex flex-col gap-0.5">
          <h3 className="font-mono text-sm font-medium">{stage.title}</h3>
          {stage.source ? (
            <p className="text-muted-foreground/70 font-mono text-[0.6875rem]">{stage.source}</p>
          ) : null}
        </div>

        <ul className="flex flex-col gap-2">
          {stage.rows.map((row) => (
            <Row key={row.text} row={row} />
          ))}
        </ul>
      </div>
    </div>
  );
}
