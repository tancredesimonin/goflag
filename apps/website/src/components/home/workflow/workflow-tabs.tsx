"use client";

import { useTranslations } from "next-intl";
import {
  BotIcon,
  LanguagesIcon,
  LinkIcon,
  ShieldCheckIcon,
  TagsIcon,
  type LucideIcon,
} from "lucide-react";

import { Connector } from "@/components/home/workflow/connector";
import { PreventsFlow } from "@/components/home/workflow/prevents-flow";
import { WorkflowCard } from "@/components/home/workflow/workflow-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FLOWS, type FlowIcon } from "@/lib/workflow";

const ICON: Record<FlowIcon, LucideIcon> = {
  shield: ShieldCheckIcon,
  link: LinkIcon,
  languages: LanguagesIcon,
  robots: BotIcon,
  tags: TagsIcon,
};

/**
 * Client only because Radix owns the selected tab. There is no state of ours here
 * and, deliberately, no timer: the block this is adapted from advances the tabs
 * every seven seconds, which moves the page under a reader who is mid-sentence
 * and gives them nothing to stop it with (WCAG 2.2.2). Someone who wants all
 * five can click through them faster than a carousel would show them.
 */
export function WorkflowTabs({ label }: { label: string }) {
  const t = useTranslations("home.workflow");

  return (
    <Tabs defaultValue={FLOWS[0]!.id} className="gap-5">
      {/* The label is read out, not printed. "One gate, four checks" is exactly
          what the five tabs already say, and a caption above them would be a line
          spent restating the line below it. */}
      <div className="flex flex-col items-center">
        <TabsList
          aria-label={label}
          className="h-auto max-w-full flex-wrap justify-center rounded-2xl"
        >
          {FLOWS.map((flow) => {
            const Icon = ICON[flow.icon];

            return (
              <TabsTrigger key={flow.id} value={flow.id} className="flex-none">
                <Icon aria-hidden="true" />
                {t(`${flow.id}.name`)}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>

      {FLOWS.map((flow) => (
        <TabsContent key={flow.id} value={flow.id} className="flex flex-col gap-4">
          {flow.kind === "fork" ? (
            <PreventsFlow origin={flow.origin} tracks={flow.tracks} />
          ) : (
            <>
              <p className="text-center text-base font-medium text-balance">
                {t(`${flow.id}.question`)}
              </p>

              {/* Three columns and two gaps, so the connectors are laid out rather
                  than positioned. Stretched, so the cards in a row share a height.
                  The connector columns are given a width rather than sized to their
                  content: `auto` collapses to the chevron and the rule leading up to
                  it disappears. */}
              <div className="grid items-stretch gap-x-2 lg:grid-cols-[1fr_3rem_1fr_3rem_1fr]">
                <WorkflowCard flowId={flow.id} stage={flow.stages[0]} />
                <Connector />
                <WorkflowCard flowId={flow.id} stage={flow.stages[1]} />
                <Connector />
                <WorkflowCard flowId={flow.id} stage={flow.stages[2]} />
              </div>
            </>
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}
