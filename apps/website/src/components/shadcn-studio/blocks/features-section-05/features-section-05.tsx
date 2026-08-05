import type { ComponentType } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";

type Features = {
  icon: ComponentType;
  title: string;
  description: string;
  detail?: string;
}[];

interface FeaturesProps {
  title: string;
  lead: string;
  featuresList: Features;
}

const Features = ({ title, lead, featuresList }: FeaturesProps) => {
  return (
    <section className="bg-muted/40 border-y py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto mb-12 max-w-3xl space-y-4 text-center sm:mb-16">
          <h2 className="text-3xl font-semibold text-balance md:text-4xl">{title}</h2>
          <p className="text-muted-foreground text-lg">{lead}</p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {featuresList.map((item, index) => {
            const IconComponent = item.icon;

            return (
              <Card
                key={index}
                className="hover:border-foreground/25 transition-colors duration-300"
              >
                <CardContent className="flex h-full flex-col">
                  <Avatar className="mb-4 size-9">
                    <AvatarFallback className="bg-muted text-card-foreground [&>svg]:size-5">
                      <IconComponent />
                    </AvatarFallback>
                  </Avatar>
                  <h3 className="mb-2 text-lg font-semibold">{item.title}</h3>
                  <p className="text-muted-foreground text-[0.9375rem] leading-relaxed">
                    {item.description}
                  </p>
                  {item.detail ? (
                    <p className="text-muted-foreground/80 mt-4 border-t pt-3 text-sm italic">
                      {item.detail}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Features;
