import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";

export interface Release {
  version: string;
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
        // Anchored on the version rather than a position, so a link to
        // `#0.1.4` keeps pointing at 0.1.4 after the next release.
        <div
          key={release.version}
          id={release.version}
          className="relative flex scroll-mt-24 justify-end gap-2"
        >
          <div className="sticky top-24 flex w-36 flex-col items-end gap-2 self-start pb-4 max-md:hidden">
            <Badge className="flex size-6 w-auto justify-end rounded-sm font-mono text-sm font-medium">
              {release.version}
            </Badge>
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
              <Badge className="flex rounded-sm font-mono font-medium">{release.version}</Badge>
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
