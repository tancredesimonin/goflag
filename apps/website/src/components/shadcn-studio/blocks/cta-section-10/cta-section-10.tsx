import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";

interface CTASectionProps {
  title: string;
  lead: string;
  /** The action row: buttons, a copyable command, or both. */
  children: ReactNode;
}

const CTASection = ({ title, lead, children }: CTASectionProps) => {
  return (
    <section className="bg-primary py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <Card className="bg-primary rounded-none border-0 shadow-none">
          <CardContent
            className="flex justify-between gap-8 max-lg:flex-col md:px-8 lg:items-center"
            data-slot="cta-content"
          >
            <div className="max-w-xl space-y-4">
              <h2 className="text-primary-foreground text-3xl font-semibold text-balance md:text-4xl">
                {title}
              </h2>
              {/* Not `text-muted-foreground`: on `bg-primary` that pairing
                  inverts and fails contrast in one of the two themes. */}
              <p className="text-primary-foreground/70 text-lg">{lead}</p>
            </div>
            <div className="shrink-0">{children}</div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
};

export default CTASection;
