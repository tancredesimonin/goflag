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
            {"\n"}
            goflag flags
            {"\n"}
            goflag preview &lt;url&gt;
          </code>
        </pre>
        <p>
          The URL is positional and required. Everything else has a default that is safe to leave
          alone; the flags below are the ones worth knowing about when it is not.
        </p>
        <p>
          <code>goflag rules</code> and <code>goflag flags</code> answer a question about goflag
          rather than about a site, so they take no URL and touch no network. The first prints every
          rule as JSON — severity, rigor, the documents it cites, the fix snippet. The second prints
          this page&rsquo;s flag table, the same one <code>goflag --help</code> is rendered from and
          the argument parser dispatches on.
        </p>
        <p>
          <code>goflag preview</code> does take a URL, and audits like a normal run. It writes{" "}
          <code>.goflag/preview.html</code> — one self-contained file showing what Google, Open
          Graph, X, LinkedIn, Slack, Discord and WhatsApp make of each page, each surface labelled
          with how well its geometry is actually documented. It never gates: it exits 0 unless the
          run itself failed, because looking at your own cards is not a check.
        </p>
        <p>
          Neither the <Link href="/docs/rules">rule catalogue</Link> nor the flag list below is a
          description of that data — each one <em>is</em> that data, read from the file the command
          prints. That is not a detail: both pages used to be kept by hand, and both had drifted
          from the engine by the time anybody checked.
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
