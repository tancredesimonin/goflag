import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";

/**
 * The arrow between two stages.
 *
 * The block this comes from draws each connector as an absolutely positioned SVG
 * with a hand-tuned path and a matching `md:mt-68`-style offset on the card it
 * points at, animated by stroke `pathLength`. That is beautiful and unmaintainable:
 * the coordinates encode one particular content length, so editing a card's copy
 * silently moves the arrow off its target.
 *
 * This is the same reading — flow, direction — from a dashed rule and a chevron
 * that sit in the grid, so the layout positions them and no number needs to agree
 * with any other number. It also does not animate, which is the standing rule on
 * this page: nothing here waits for JavaScript to become visible.
 */
export function Connector() {
  return (
    <div className="flex items-center justify-center" aria-hidden="true">
      {/* `--border` is a 10% white in dark mode, which on a dashed hairline is not
          there at all. The muted foreground carries in both themes. */}
      <div className="hidden w-full items-center lg:flex">
        <span className="border-muted-foreground/40 w-full border-t border-dashed" />
        <ChevronRightIcon className="text-muted-foreground -ml-0.5 size-4 shrink-0" />
      </div>

      <div className="flex flex-col items-center py-2 lg:hidden">
        <span className="border-muted-foreground/40 h-6 border-l border-dashed" />
        <ChevronDownIcon className="text-muted-foreground -mt-0.5 size-4" />
      </div>
    </div>
  );
}
