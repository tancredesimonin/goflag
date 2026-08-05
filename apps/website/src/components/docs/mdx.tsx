import { MDXContent } from "@content-collections/mdx/react";
import { InfoIcon, LightbulbIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { SITE } from "@/lib/constants";
import { cn } from "@/lib/utils";

function SiteEmail() {
  return (
    <a href={`mailto:${SITE.email}`} className="text-link underline-offset-4">
      {SITE.email}
    </a>
  );
}

const CALLOUT = {
  note: { icon: InfoIcon, className: "border-link/50", iconClass: "text-link" },
  warning: {
    icon: TriangleAlertIcon,
    className: "border-flag-yellow/60",
    iconClass: "text-flag-yellow",
  },
  tip: { icon: LightbulbIcon, className: "border-flag-green/60", iconClass: "text-flag-green" },
} as const;

function Callout({
  type = "note",
  title,
  children,
}: {
  type?: keyof typeof CALLOUT;
  title?: string;
  children: ReactNode;
}) {
  const { icon: Icon, className, iconClass } = CALLOUT[type];

  return (
    <div className={cn("bg-muted/50 my-6 rounded-lg border-l-2 p-5", className)}>
      <p className="text-foreground m-0 flex items-center gap-2 font-semibold not-prose">
        <Icon className={cn("size-4.5 shrink-0", iconClass)} aria-hidden="true" />
        {title}
      </p>
      <div className="[&>*:last-child]:mb-0 [&>p]:mb-0 [&>p+p]:mt-3">{children}</div>
    </div>
  );
}

/**
 * Internal links go through the app router; external ones are marked as such
 * once, here, rather than in every MDX file.
 */
function Anchor({ href = "", children, ...props }: ComponentPropsWithoutRef<"a">) {
  if (href.startsWith("/")) {
    return (
      <Link href={href} {...props}>
        {children}
      </Link>
    );
  }

  return (
    <a href={href} target="_blank" rel="noreferrer" {...props}>
      {children}
    </a>
  );
}

const components = {
  Callout,
  SiteEmail,
  a: Anchor,
  table: (props: ComponentPropsWithoutRef<"table">) => (
    <div className="my-6 overflow-x-auto rounded-lg border">
      <table className="m-0 w-full text-sm" {...props} />
    </div>
  ),
};

export function Mdx({ code }: { code: string }) {
  return (
    <div className="prose prose-neutral dark:prose-invert prose-headings:font-display prose-headings:tracking-tight prose-h2:mt-12 prose-h2:scroll-mt-24 prose-h3:scroll-mt-24 prose-a:text-link prose-a:decoration-link/40 prose-a:underline-offset-2 prose-code:font-mono prose-code:before:content-none prose-code:after:content-none prose-th:text-left prose-thead:border-b prose-td:align-top max-w-none">
      <MDXContent code={code} components={components} />
    </div>
  );
}
