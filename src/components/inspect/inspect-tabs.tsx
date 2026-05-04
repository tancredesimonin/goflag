"use client";

import { useEffect, useState, type ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JUMP_TO_ORIGIN_EVENT } from "@/components/inspect/raw/raw-head-viewer";

export interface InspectTabsProps {
  /** Pre-rendered tab panels. The server component owns the data;
   *  this client wrapper only owns the *active* tab so it can react to
   *  cross-tab events (Phase 5: "Jump to tag" from Issues → Raw). */
  panels: {
    previews: ReactNode;
    issues: ReactNode;
    raw: ReactNode;
    structured: ReactNode;
    i18n: ReactNode;
    assets: ReactNode;
  };
  /** Counter pills shown on tab triggers — number of issues, JSON-LD blocks, etc. */
  counts?: {
    issues?: number;
    structured?: number;
    i18n?: number;
    assets?: number;
  };
  /** Initial active tab. Defaults to "raw" for parity with the Phase 3 UI. */
  defaultTab?: "previews" | "issues" | "raw" | "structured" | "i18n" | "assets";
}

/**
 * Client wrapper around the inspect Tabs primitive.
 *
 * The Phase 3 implementation kept Tabs uncontrolled and rendered every
 * panel server-side. Phase 5 needs cross-tab control: clicking
 * "Jump to tag" inside the Issues panel must switch the active tab to
 * "raw" before the Raw viewer scrolls to the matching row. The
 * cleanest way to keep server-rendered panels and add that behavior
 * is to lift the active-tab state into this small client component
 * and listen for the same `JUMP_TO_ORIGIN_EVENT` the Raw viewer
 * already consumes.
 */
export function InspectTabs({ panels, counts = {}, defaultTab = "raw" }: InspectTabsProps) {
  const [active, setActive] = useState<InspectTabsProps["defaultTab"]>(defaultTab);

  useEffect(() => {
    function onJump() {
      setActive("raw");
    }
    document.addEventListener(JUMP_TO_ORIGIN_EVENT, onJump);
    return () => document.removeEventListener(JUMP_TO_ORIGIN_EVENT, onJump);
  }, []);

  return (
    <Tabs
      value={active}
      onValueChange={(value) => setActive(value as InspectTabsProps["defaultTab"])}
      className="w-full"
    >
      <TabsList className="bg-muted/40 grid w-full grid-cols-6">
        <TabsTrigger value="previews" data-testid="tab-previews">
          Previews
        </TabsTrigger>
        <TabsTrigger value="issues" data-testid="tab-issues">
          Issues
          {counts.issues ? (
            <span className="text-muted-foreground ml-1 text-[10px] tabular-nums">
              {counts.issues}
            </span>
          ) : null}
        </TabsTrigger>
        <TabsTrigger value="raw" data-testid="tab-raw">
          Raw
        </TabsTrigger>
        <TabsTrigger value="structured" data-testid="tab-structured">
          Structured data
        </TabsTrigger>
        <TabsTrigger value="i18n" data-testid="tab-i18n">
          i18n
        </TabsTrigger>
        <TabsTrigger value="assets" data-testid="tab-assets">
          Assets
        </TabsTrigger>
      </TabsList>

      <TabsContent value="previews" className="mt-4">
        {panels.previews}
      </TabsContent>
      <TabsContent value="issues" className="mt-4">
        {panels.issues}
      </TabsContent>
      <TabsContent value="raw" className="mt-4">
        {panels.raw}
      </TabsContent>
      <TabsContent value="structured" className="mt-4">
        {panels.structured}
      </TabsContent>
      <TabsContent value="i18n" className="mt-4">
        {panels.i18n}
      </TabsContent>
      <TabsContent value="assets" className="mt-4 space-y-6">
        {panels.assets}
      </TabsContent>
    </Tabs>
  );
}
