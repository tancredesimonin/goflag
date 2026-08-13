import type { Metadata } from "next";
import Link from "next/link";

import { DocsPage } from "@/components/docs/docs-page";
import { Badge } from "@/components/ui/badge";
import { ENGINE_LIMITS, EXIT_CODES, FLAG_GROUPS } from "@/lib/cli-reference";
import { routes } from "@/lib/seo/site";
import { cn } from "@/lib/utils";

const TITLE = "CLI reference";
const DESCRIPTION =
  "Every flag goflag accepts, its default, and what it changes, grouped by the question it answers rather than alphabetically.";

const TONE = {
  green: "text-flag-green",
  yellow: "text-flag-yellow",
  red: "text-flag-red",
} as const;

export const metadata: Metadata = routes.metadata({
  path: "/docs/cli",
  title: TITLE,
  description: DESCRIPTION,
});

export default function CliPage() {
  return (
    <DocsPage title={TITLE} description={DESCRIPTION} href="/docs/cli">
      <div className="prose prose-neutral dark:prose-invert prose-a:text-link max-w-none">
        <pre className="bg-terminal text-terminal-foreground border-terminal-border overflow-x-auto rounded-lg border">
          <code>
            goflag &lt;url&gt; [options]
            {"\n"}
            goflag rules
          </code>
        </pre>
        <p>
          The URL is positional and required. Everything else has a default that is safe to leave
          alone; the flags below are the ones worth knowing about when it is not.
        </p>
        <p>
          <code>goflag rules</code> is the exception: it answers a question about goflag rather than
          about a site, so it takes no URL and touches no network. It prints every rule as JSON —
          severity, rigor, the documents it cites, the fix snippet. The{" "}
          <Link href="/docs/rules">rule catalogue</Link> on this site is not a description of that
          data, it is that data: this page is built from the same file the command prints.
        </p>
      </div>

      {FLAG_GROUPS.map((group) => (
        <section key={group.id} className="mt-12">
          <h2
            id={group.id}
            className="font-display scroll-mt-24 text-2xl font-semibold tracking-tight"
          >
            {group.title}
          </h2>
          <p className="text-muted-foreground mt-2 leading-relaxed">{group.intro}</p>

          <dl className="mt-6 divide-y rounded-lg border">
            {group.flags.map((flag) => (
              <div key={flag.flag} className="px-5 py-4">
                <dt className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-sm font-semibold">{flag.flag}</code>
                  {flag.short ? (
                    <code className="text-muted-foreground font-mono text-sm">{flag.short}</code>
                  ) : null}
                  {flag.default ? (
                    <Badge variant="outline" className="font-mono text-[0.6875rem] font-normal">
                      default {flag.default}
                    </Badge>
                  ) : null}
                  {flag.requires ? (
                    <Badge
                      variant="outline"
                      className="border-flag-yellow/50 text-flag-yellow font-mono text-[0.6875rem] font-normal"
                    >
                      requires {flag.requires}
                    </Badge>
                  ) : null}
                </dt>
                <dd className="text-muted-foreground mt-2 text-[0.9375rem] leading-relaxed">
                  {flag.description}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      <section className="mt-12">
        <h2
          id="exit-codes"
          className="font-display scroll-mt-24 text-2xl font-semibold tracking-tight"
        >
          Exit codes
        </h2>
        <p className="text-muted-foreground mt-2 leading-relaxed">
          Only <code className="font-mono">1</code> is a verdict about your site. Treat{" "}
          <code className="font-mono">2</code> as a broken job.
        </p>

        <dl className="mt-6 divide-y rounded-lg border">
          {EXIT_CODES.map((exit) => (
            <div key={exit.code} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:gap-6">
              <dt className={cn("shrink-0 font-mono text-sm font-semibold", TONE[exit.tone])}>
                {exit.code} · {exit.label}
              </dt>
              <dd className="text-muted-foreground text-[0.9375rem]">{exit.meaning}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-12">
        <h2
          id="engine-limits"
          className="font-display scroll-mt-24 text-2xl font-semibold tracking-tight"
        >
          Engine limits
        </h2>
        <p className="text-muted-foreground mt-2 leading-relaxed">
          Compiled in, not configurable. See{" "}
          <Link className="text-link" href="/docs/limits">
            Limits
          </Link>{" "}
          for what happens when a run hits one.
        </p>

        <dl className="mt-6 divide-y rounded-lg border">
          {ENGINE_LIMITS.map((limit) => (
            <div key={limit.what} className="flex justify-between gap-6 px-5 py-3 text-[0.9375rem]">
              <dt className="text-muted-foreground">{limit.what}</dt>
              <dd className="font-mono">{limit.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </DocsPage>
  );
}
