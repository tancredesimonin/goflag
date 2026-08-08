import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";

export interface Release {
  /**
   * Anchor and React key. Not the version: two packages share this timeline and
   * both have shipped a `0.2.0`, so a version alone collides in the DOM and
   * makes `#0.2.0` mean whichever one rendered last.
   */
  id: string;
  version: string;
  /** Which package shipped it, printed so the two version lines stay legible. */
  packageName: string;
  date: string;
  content: ReactNode;
}

interface ChangelogContentProps {
  releases: Release[];
}

const ChangelogContent = ({ releases }: ChangelogContentProps) => {
  return (
    <>
      {releases.map((release) => (
        // Anchored on the release rather than a position, so a link to
        // `#cli-0.1.4` keeps pointing at it after the next release.
        <div
          key={release.id}
          id={release.id}
          className="relative flex scroll-mt-24 justify-end gap-2"
        >
          <div className="sticky top-24 flex w-36 flex-col items-end gap-2 self-start pb-4 max-md:hidden">
            <Badge className="flex size-6 w-auto justify-end rounded-sm font-mono text-sm font-medium">
              {release.version}
            </Badge>
            <div className="text-muted-foreground text-right font-mono text-xs">
              {release.packageName}
            </div>
            <div className="text-muted-foreground text-right text-sm font-medium">
              {release.date}
            </div>
          </div>
          <div className="flex flex-col items-center">
            <div className="sticky top-24 flex size-6 items-center justify-center max-sm:top-5">
              <span className="bg-brand/20 flex size-4.5 shrink-0 items-center justify-center rounded-full">
                <span className="bg-brand size-3 rounded-full" />
              </span>
            </div>
            <span className="-mt-2.5 w-px flex-1 border" />
          </div>
          <div className="flex flex-1 flex-col gap-4 pb-11 pl-3 md:pl-6 lg:pl-9">
            <div className="flex flex-col gap-2 md:hidden">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="flex rounded-sm font-mono font-medium">{release.version}</Badge>
                <span className="text-muted-foreground font-mono text-xs">
                  {release.packageName}
                </span>
              </div>
              <div className="font-medium">{release.date}</div>
            </div>
            {release.content}
          </div>
        </div>
      ))}
    </>
  );
};

export default ChangelogContent;
