"use client";

import {
  LanguagesIcon,
  LinkIcon,
  NetworkIcon,
  ShieldCheckIcon,
  TagsIcon,
  type LucideIcon,
} from "lucide-react";

import { Connector } from "@/components/home/workflow/connector";
import { WorkflowCard } from "@/components/home/workflow/workflow-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FLOWS, type FlowIcon } from "@/lib/workflow";

const ICON: Record<FlowIcon, LucideIcon> = {
  crawl: NetworkIcon,
  link: LinkIcon,
  languages: LanguagesIcon,
  tags: TagsIcon,
  gate: ShieldCheckIcon,
};

/**
 * Client only because Radix owns the selected tab. There is no state of ours here
 * and, deliberately, no timer: the block this is adapted from advances the tabs
 * every seven seconds, which moves the page under a reader who is mid-sentence
 * and gives them nothing to stop it with (WCAG 2.2.2). Someone who wants to see
 * all five passes can click through them faster than a carousel would.
 */
export function WorkflowTabs({ label }: { label: string }) {
  return (
    <Tabs defaultValue={FLOWS[0]!.id} className="gap-6">
      <div className="flex flex-col items-center gap-3">
        <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">
          {label}
        </p>
        <TabsList
          aria-label={label}
          className="h-auto max-w-full flex-wrap justify-center rounded-2xl"
        >
          {FLOWS.map((flow) => {
            const Icon = ICON[flow.icon];

            return (
              <TabsTrigger key={flow.id} value={flow.id} className="flex-none">
                <Icon aria-hidden="true" />
                {flow.name}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>

      {FLOWS.map((flow) => (
        <TabsContent key={flow.id} value={flow.id} className="flex flex-col gap-6">
          <p className="text-center text-lg font-medium text-balance">{flow.question}</p>

          {/* Three columns and two gaps, so the connectors are laid out rather than
              positioned. Stretched, so the cards in a row share a height. The
              connector columns are given a width rather than sized to their
              content: `auto` collapses to the chevron and the rule leading up to
              it disappears. */}
          <div className="grid items-stretch gap-x-2 lg:grid-cols-[1fr_3rem_1fr_3rem_1fr]">
            <WorkflowCard stage={flow.stages[0]} />
            <Connector />
            <WorkflowCard stage={flow.stages[1]} />
            <Connector />
            <WorkflowCard stage={flow.stages[2]} />
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
