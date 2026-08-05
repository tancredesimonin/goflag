import type { Metadata } from "next";
import Link from "next/link";

import { DocsPage } from "@/components/docs/docs-page";
import { Badge } from "@/components/ui/badge";
import { PAGE_RULES, RECIPROCITY_CODES, SITE_RULES, type RuleSeverity } from "@/lib/rules-catalog";
import { buildDocsMetadata } from "@/lib/seo/metadata";
import { cn } from "@/lib/utils";

const TITLE = "Rule catalogue";
const DESCRIPTION = `Every rule goflag can report: ${PAGE_RULES.length} judged per page, ${SITE_RULES.length} across the whole site, plus the hreflang reciprocity codes.`;

const SEVERITY_CLASS: Record<RuleSeverity, string> = {
  error: "text-flag-red border-flag-red/40",
  warning: "text-flag-yellow border-flag-yellow/40",
  info: "text-muted-foreground",
};

export const metadata: Metadata = buildDocsMetadata({
  path: "/docs/rules",
  title: TITLE,
  description: DESCRIPTION,
});

function RuleTable({ rules }: { rules: typeof PAGE_RULES }) {
  return (
    <div className="mt-6 overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/60 text-muted-foreground">
          <tr>
            <th scope="col" className="px-5 py-3 font-medium">
              Rule
            </th>
            <th scope="col" className="px-5 py-3 font-medium">
              Severity
            </th>
            <th scope="col" className="px-5 py-3 font-medium">
              What it checks
            </th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <tr key={rule.id} className="border-t align-top">
              <th scope="row" className="px-5 py-3 font-normal whitespace-nowrap">
                <Link
                  href={`/docs/rules/${rule.id}`}
                  className="text-link font-mono hover:underline"
                >
                  {rule.id}
                </Link>
              </th>
              <td className={cn("px-5 py-3 font-mono", SEVERITY_CLASS[rule.severity])}>
                {rule.severity}
              </td>
              <td className="text-muted-foreground px-5 py-3">{rule.summary}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function RulesPage() {
  return (
    <DocsPage title={TITLE} description={DESCRIPTION} href="/docs/rules">
      <section>
        <h2
          className="font-display scroll-mt-24 text-2xl font-semibold tracking-tight"
          id="page-rules"
        >
          Page rules
        </h2>
        <p className="text-muted-foreground mt-2 leading-relaxed">
          Judged on one page at a time, from its{" "}
          <code className="font-mono text-sm">&lt;head&gt;</code>. Each rule is a pure function of
          the page, which is why a finding can always be reproduced from the URL alone.
        </p>
        <RuleTable rules={PAGE_RULES} />
      </section>

      <section className="mt-12">
        <h2
          className="font-display scroll-mt-24 text-2xl font-semibold tracking-tight"
          id="site-rules"
        >
          Site rules
        </h2>
        <p className="text-muted-foreground mt-2 leading-relaxed">
          Judged across the whole crawl, because no single page carries the evidence. Fixing one of
          these usually fixes a whole column of findings at once.
        </p>
        <RuleTable rules={SITE_RULES} />
      </section>

      <section className="mt-12">
        <h2
          className="font-display scroll-mt-24 text-2xl font-semibold tracking-tight"
          id="reciprocity"
        >
          hreflang reciprocity codes
        </h2>
        <p className="text-muted-foreground mt-2 leading-relaxed">
          Computed cross-page and reported under{" "}
          <code className="font-mono text-sm">missingTranslations.reciprocity</code> rather than
          through the rule registry, which is why they carry a code instead of a severity. See{" "}
          <Link href="/docs/i18n" className="text-link hover:underline">
            Translations
          </Link>
          .
        </p>

        <dl className="mt-6 divide-y rounded-lg border">
          {RECIPROCITY_CODES.map((entry) => (
            <div key={entry.code} className="px-5 py-4">
              <dt className="font-mono text-sm font-semibold">{entry.code}</dt>
              <dd className="mt-2 space-y-2 text-[0.9375rem]">
                <p className="text-muted-foreground">{entry.why}</p>
                <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 font-mono text-[0.8125rem]">
                  {entry.message}
                </p>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="border-flag-yellow/50 bg-muted/40 mt-12 rounded-lg border-l-2 p-6">
        <p className="mb-2 flex items-center gap-2 font-semibold">
          <Badge variant="outline" className="font-mono text-[0.6875rem] font-normal">
            heuristic
          </Badge>
          The length thresholds cite no specification
        </p>
        <p className="text-muted-foreground leading-relaxed">
          Nothing in this catalogue yet cites a standard, because for the length windows there is
          none to cite. Treat <code className="font-mono text-sm">title.length</code> and{" "}
          <code className="font-mono text-sm">description.length</code> as the conventions they are.
        </p>
      </div>
    </DocsPage>
  );
}
