import { cn } from "@/lib/utils";
import { SITE } from "@/lib/constants";

export function FlagMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("size-6", className)}
      fill="none"
      strokeLinecap="square"
    >
      <path d="M5.25 2.5v19" stroke="currentColor" strokeWidth="1.75" />
      {/* `--brand`, not `--flag-green`: the mark is the outcome the tool exists
          to produce, not one of the verdicts it reports. */}
      <path d="M5.25 4h13l-2.6 4.25 2.6 4.25h-13z" className="fill-brand" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <FlagMark />
      <span className="font-display text-lg font-semibold tracking-tight">{SITE.name}</span>
    </span>
  );
}
