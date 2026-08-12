import type { ReactNode } from "react";
import { CheckIcon } from "lucide-react";

import { Connector } from "@/components/home/workflow/connector";
import type { CheckFlowId } from "@/lib/workflow";
import { cn } from "@/lib/utils";

/**
 * The four check tabs, drawn instead of described.
 *
 * The first draft ran every tab through the same `input → check → output`
 * pipeline, each stage a card of captioned bullet points. Nobody read the
 * captions, and the pipeline shape said "how it works" when a scanning reader
 * only wants "what it catches". So each tab now shows the check itself — the
 * matrix with a hole in it, the two files that contradict each other — in the
 * shape that check actually has.
 *
 * Everything in here is literal and identical in every locale, which is why no
 * string goes through `next-intl`: identifiers (`brokenLinks[]`), rule ids
 * (`robots.blocks-site`), markup and printed output are recognised, not read,
 * and translating them would make them wrong. The one translated line on a tab
 * is the question above the diagram. Rule ids, report fields and messages are
 * checked against `packages/cli/src` — nothing here claims what the engine
 * does not do.
 */

function Card({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-card flex h-full flex-col gap-3 rounded-xl border p-4 shadow-sm",
        className,
      )}
    >
      {title ? <h3 className="font-mono text-sm font-medium">{title}</h3> : null}
      {children}
    </div>
  );
}

/** A block in the site's terminal palette, one line per child. */
function Term({ lines, className }: { lines: readonly ReactNode[]; className?: string }) {
  return (
    <div
      className={cn(
        "bg-terminal text-terminal-foreground border-terminal-border overflow-x-auto rounded-md border px-3 py-2.5 font-mono text-xs leading-relaxed whitespace-nowrap",
        className,
      )}
    >
      {lines.map((line, index) => (
        <div key={index}>{line}</div>
      ))}
    </div>
  );
}

/** A skeleton text bar; `link` draws it as an anchor rather than prose. */
function Bar({ w, link }: { w: string; link?: boolean }) {
  return (
    <span
      className={cn(
        "h-1.5 rounded-full",
        w,
        link ? "bg-link/70 border-link/70 rounded-none border-b" : "bg-muted-foreground/25",
      )}
    />
  );
}

/* Every link on every crawled page → one probe per target → the report entry,
 * mapped back to the page that carries the link. */
function LinksFlow() {
  return (
    <div className="grid items-stretch gap-x-2 lg:grid-cols-[1fr_3rem_1fr_3rem_1fr]">
      <Card title="Every <a href>">
        <div aria-hidden="true" className="flex flex-col gap-2 rounded-md border p-3">
          <Bar w="w-1/2" />
          <div className="flex gap-1.5">
            <Bar w="w-1/4" />
            <Bar w="w-1/3" link />
            <Bar w="w-1/5" />
          </div>
          <div className="flex gap-1.5">
            <Bar w="w-2/5" link />
            <Bar w="w-1/4" />
          </div>
          <div className="flex gap-1.5">
            <Bar w="w-1/3" />
            <Bar w="w-1/4" link />
          </div>
        </div>
      </Card>

      <Connector />

      <Card>
        <Term
          lines={[
            <span key="ok" className="text-flag-green">
              [200] /pricing
            </span>,
            <span key="dead" className="text-flag-red">
              [404] /ghost
            </span>,
            <span key="blocked" className="text-flag-yellow">
              [blocked 403] /members
            </span>,
          ]}
        />
      </Card>

      <Connector />

      <Card title="brokenLinks[]">
        <Term
          lines={[
            <span key="open" className="text-terminal-dim">
              {"{"}
            </span>,
            <span key="href">
              <span className="text-terminal-dim">{'  "href": '}</span>
              {'"/ghost",'}
            </span>,
            <span key="status">
              <span className="text-terminal-dim">{'  "status": '}</span>
              <span className="text-flag-red">404</span>,
            </span>,
            <span key="page">
              <span className="text-terminal-dim">{'  "pageUrl": '}</span>
              {'"/blog/launch"'}
            </span>,
            <span key="close" className="text-terminal-dim">
              {"}"}
            </span>,
          ]}
        />
      </Card>
    </div>
  );
}

const LOCALES = ["en", "fr", "es", "pt"] as const;
const ROUTES = [
  { route: "/", hole: null },
  { route: "/pricing", hole: null },
  { route: "/about", hole: "es" },
] as const;

/* The route × locale matrix is the check, so the tab shows the matrix — with
 * the one empty cell a link crawler has no way to notice. */
function I18nFlow() {
  return (
    <div className="grid items-stretch gap-x-2 lg:grid-cols-[5fr_3rem_4fr]">
      <Card title="route × locale">
        <table
          aria-hidden="true"
          className="w-full border-separate border-spacing-y-1 font-mono text-xs"
        >
          <thead>
            <tr className="text-muted-foreground">
              <th />
              {LOCALES.map((locale) => (
                <th key={locale} scope="col" className="pb-1 text-center font-normal">
                  {locale}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROUTES.map(({ route, hole }) => (
              <tr key={route}>
                <th scope="row" className="text-muted-foreground pr-3 text-left font-normal">
                  {route}
                </th>
                {LOCALES.map((locale) => (
                  <td key={locale} className="text-center">
                    {locale === hole ? (
                      <span className="border-flag-yellow/60 inline-block size-3.5 rounded-sm border border-dashed align-middle" />
                    ) : (
                      <CheckIcon className="text-flag-green inline size-3.5" strokeWidth={3} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Connector />

      <Card title="missingTranslations">
        <Term
          lines={[
            <span key="open" className="text-terminal-dim">
              {"{"}
            </span>,
            <span key="route">
              <span className="text-terminal-dim">{'  "route": '}</span>
              {'"/about",'}
            </span>,
            <span key="present">
              <span className="text-terminal-dim">{'  "presentLocales": '}</span>
              {'["en", "fr", "pt"],'}
            </span>,
            <span key="missing">
              <span className="text-terminal-dim">{'  "missingLocales": '}</span>
              <span className="text-flag-yellow">{'["es"]'}</span>
            </span>,
            <span key="close" className="text-terminal-dim">
              {"}"}
            </span>,
          ]}
        />
      </Card>
    </div>
  );
}

/* Two files, each fine on its own, read together for once. The verdict line
 * quotes what the rule actually prints. */
function RobotsFlow() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-stretch gap-x-2 lg:grid-cols-[1fr_3rem_1fr]">
        <Card title="robots.txt">
          <Term
            lines={[
              "User-agent: *",
              <span key="disallow" className="text-flag-red">
                Disallow: /
              </span>,
            ]}
          />
        </Card>

        {/* Not a pipeline arrow: nothing flows from one file to the other.
            They are two declarations of intent that cannot both be true. */}
        <div aria-hidden="true" className="flex items-center justify-center py-2">
          <span className="border-flag-red/50 text-flag-red flex size-8 shrink-0 items-center justify-center rounded-full border font-mono text-sm">
            ≠
          </span>
        </div>

        <Card title="<head>">
          <Term
            lines={[
              '<meta name="robots"',
              <span key="content">
                {'      content="'}
                <span className="text-flag-green">index,follow</span>
                {'">'}
              </span>,
            ]}
          />
        </Card>
      </div>

      <Term
        className="lg:mx-auto lg:w-fit"
        lines={[
          <span key="verdict">
            <span className="text-flag-red">error</span>{" "}
            <span className="text-terminal-dim">robots.blocks-site</span> robots.txt wins, so the
            pages are never fetched and the meta tag is never read
          </span>,
        ]}
      />
    </div>
  );
}

/* One head with two defects — a thin description and a missing canonical — and
 * the two warnings they become; ids and severities straight from the rule
 * registry. */
function MetadataFlow() {
  return (
    <div className="grid items-stretch gap-x-2 lg:grid-cols-[1fr_3rem_1fr]">
      <Card title="The <head>">
        <Term
          lines={[
            "<title>Pricing | Acme</title>",
            <span key="description">
              {'<meta name="description" content="'}
              <span className="text-flag-yellow underline decoration-wavy underline-offset-3">
                ………………………………………………
              </span>
              {'">'}
            </span>,
          ]}
        />
        {/* The tag that is not there, drawn as the hole it leaves. */}
        <div
          aria-hidden="true"
          className="border-muted-foreground/40 text-muted-foreground/70 rounded-md border border-dashed px-3 py-2 font-mono text-xs"
        >
          {'<link rel="canonical" …>'}
        </div>
      </Card>

      <Connector />

      <Card title="seoIssues[]">
        <Term
          lines={[
            <span key="length">
              <span className="text-flag-yellow">warning</span>{" "}
              <span className="text-terminal-dim">description.length</span>
            </span>,
            <span key="canonical">
              <span className="text-flag-yellow">warning</span>{" "}
              <span className="text-terminal-dim">canonical.missing</span>
            </span>,
          ]}
        />
      </Card>
    </div>
  );
}

const FLOWS: Record<CheckFlowId, () => ReactNode> = {
  links: LinksFlow,
  i18n: I18nFlow,
  robots: RobotsFlow,
  metadata: MetadataFlow,
};

export function CheckFlow({ id }: { id: CheckFlowId }) {
  const Flow = FLOWS[id];
  return <Flow />;
}
