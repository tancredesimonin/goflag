import type { Metadata } from "next";
import Link from "next/link";

import { DocsPage } from "@/components/docs/docs-page";
import { Badge } from "@/components/ui/badge";
import {
  PAGE_RULES,
  PROSE_RULES,
  RECIPROCITY_CODES,
  SITE_RULES,
  type RuleSeverity,
} from "@/lib/rules-catalog";
import { routeMetadata } from "@/lib/seo/site-routes";
import { cn } from "@/lib/utils";

const TITLE = "Rule catalogue";
const DESCRIPTION = `Every rule goflag can report: ${PAGE_RULES.length} judged per page, ${SITE_RULES.length} across the whole site, ${PROSE_RULES.length} it states but will not answer, plus the hreflang reciprocity codes.`;

const SEVERITY_CLASS: Record<RuleSeverity, string> = {
  error: "text-flag-red border-flag-red/40",
  warning: "text-flag-yellow border-flag-yellow/40",
  info: "text-muted-foreground",
};

/** The rigor ladder, most authoritative first. Mirrors the CLI's `Rigor`. */
const RIGOR_LEVELS = [
  {
    id: "spec-required",
    meaning: "A published standard says the page MUST do this. Not a matter of taste.",
  },
  {
    id: "spec-recommended",
    meaning: "A standard says SHOULD: expected practice, with room for a deliberate exception.",
  },
  {
    id: "vendor-spec",
    meaning:
      "A de-facto specification a single vendor controls — Open Graph, Google's canonicalization rules. Binding on the consumers that implement it, not on the web.",
  },
  {
    id: "guideline",
    meaning: "Documented best practice from a source worth trusting. No specification behind it.",
  },
  {
    id: "heuristic",
    meaning:
      "Industry folklore. Often useful, occasionally wrong, and never something to fix as though a standard demanded it.",
  },
] as const;

export const metadata: Metadata = routeMetadata({
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
              Rigor
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
              <td
                className={cn(
                  "px-5 py-3 font-mono",
                  rule.severity ? SEVERITY_CLASS[rule.severity] : "text-muted-foreground",
                )}
              >
                {rule.severity ?? "—"}
              </td>
              <td className="text-muted-foreground px-5 py-3 font-mono whitespace-nowrap">
                {rule.rigor ?? "—"}
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
          id="prose-rules"
        >
          Rules goflag will not answer for you
        </h2>
        <p className="text-muted-foreground mt-2 leading-relaxed">
          Whether a title <em>describes</em> the page is not something a linter can decide. goflag
          could fake it — count words, match boilerplate, print a confident verdict — and the result
          would be unfalsifiable noise. So it states the question, cites what makes it a real
          requirement, attaches the observed facts, and stops. Ask for them with{" "}
          <code className="font-mono text-sm">--advisories</code>; they carry no severity, never
          count toward the verdict, and are only asked where the subject exists.
        </p>
        <RuleTable rules={PROSE_RULES} />
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

      <section className="mt-12">
        <h2 className="font-display scroll-mt-24 text-2xl font-semibold tracking-tight" id="rigor">
          What rigor means
        </h2>
        <p className="text-muted-foreground mt-2 leading-relaxed">
          Every rule records how authoritative the requirement behind it is, and cites at least one
          document that backs it. This is the honest answer to &ldquo;says who?&rdquo;: a{" "}
          <code className="font-mono text-sm">heuristic</code> is folklore you may knowingly ignore,
          a <code className="font-mono text-sm">spec-required</code> is not. A rule can never claim
          more authority than its strongest source carries — that is enforced in CI, not left to
          good intentions.
        </p>

        <dl className="mt-6 divide-y rounded-lg border">
          {RIGOR_LEVELS.map((level) => (
            <div key={level.id} className="px-5 py-4">
              <dt className="font-mono text-sm font-semibold">{level.id}</dt>
              <dd className="text-muted-foreground mt-2 text-[0.9375rem]">{level.meaning}</dd>
            </div>
          ))}
        </dl>

        <p className="text-muted-foreground mt-6 leading-relaxed">
          Rigor is a fact about the world, so no option changes it. What your build should{" "}
          <em>do</em> about each rule is a separate question, and that is what{" "}
          <Link href="/docs/profiles" className="text-link hover:underline">
            profiles
          </Link>{" "}
          answer.
        </p>
      </section>

      <div className="border-flag-yellow/50 bg-muted/40 mt-12 rounded-lg border-l-2 p-6">
        <p className="mb-2 flex items-center gap-2 font-semibold">
          <Badge variant="outline" className="font-mono text-[0.6875rem] font-normal">
            heuristic
          </Badge>
          The length thresholds cite no specification
        </p>
        <p className="text-muted-foreground leading-relaxed">
          <code className="font-mono text-sm">title.length</code> and{" "}
          <code className="font-mono text-sm">description.length</code> cite Google and Moz, and
          neither is a standard: Google states outright that title length is not a ranking factor.
          They ship as the display conventions they are, which is why{" "}
          <code className="font-mono text-sm">--profile spec-only</code> switches them off entirely
          rather than merely quieting them.
        </p>
      </div>
    </DocsPage>
  );
}
