import { cn } from "@/lib/utils";

/**
 * When goflag boots a browser, and when it does not.
 *
 * `install.mdx` carries this as a single sentence with a seven-term conjunction
 * inside it, in an accordion that is closed by default. It is the page where a
 * reader decides whether to believe the findings, and the decision turns on a
 * condition that is genuinely hard to hold in the head as prose.
 *
 * ## CSS, not hand-placed SVG
 *
 * `docs/visuals-plan.md` V3 says inline SVG, and this is the shape that has real
 * geometry, so it should be the case for it. It is not, because the repository
 * already answered the question: `components/home/workflow/connector.tsx` draws
 * its connectors in CSS precisely so they survive a reflow and a reader's text
 * size. Coordinates baked into a `path` would not. The rule that comes out of
 * both figures is narrower than the plan's: geometry that has to *measure*
 * belongs in SVG; geometry that only has to *connect* belongs in the layout.
 *
 * ## Pinned, because a drawing cannot be generated
 *
 * `chromium-tree.test.ts` reads the `likely` conjunction out of
 * `packages/cli/src/lib/core/extract/heuristics.ts` and fails when a term is
 * added, removed or renamed there. The seven below are not a description of
 * that condition, they are the same list read twice.
 */

/**
 * The seven terms of `likely`, in source order.
 *
 * `signal` is the identifier the engine uses, and the test matches on it: the
 * label is for the reader and may be rewritten freely, the signal may not.
 * `title` covers two identifiers because the engine ORs them — a missing title
 * and a placeholder title are the same evidence.
 */
export const CHROMIUM_SIGNALS: ReadonlyArray<{
  signals: readonly string[];
  label: string;
  detail: string;
}> = [
  {
    signals: ["titleMissing", "titlePlaceholder"],
    label: "no real title",
    detail: "absent, or one of the framework placeholders like “React App”",
  },
  { signals: ["descMissing"], label: "no description", detail: "no meta description" },
  { signals: ["canonicalMissing"], label: "no canonical", detail: "no link rel=canonical" },
  { signals: ["ogMissing"], label: "no og:*", detail: "not one Open Graph tag, of any kind" },
  { signals: ["twitterMissing"], label: "no twitter:*", detail: "no card, title or image" },
  { signals: ["jsonLdMissing"], label: "no JSON-LD", detail: "no structured data block" },
  { signals: ["hreflangMissing"], label: "no hreflang", detail: "no alternate declared" },
];

/** The four ways a page can be judged, and what each one costs the reader. */
export const CHROMIUM_OUTCOMES: ReadonlyArray<{
  when: string;
  outcome: string;
  detail: string;
  tone: "green" | "yellow" | "red";
}> = [
  {
    when: "--static was passed",
    outcome: "judged on the static HTML",
    detail:
      "The detection does not run at all. Deliberate, and the right default in CI — it needs no browser and cannot mistake a broken page for a fine one. It can call a hydrated page empty, which is a loud failure rather than a quiet pass.",
    tone: "green",
  },
  {
    when: "any one of the seven is present",
    outcome: "judged on the static HTML",
    detail:
      "The common case. One real tag is enough: a page with a title and a description is server-rendered and merely incomplete, which is the rule engine's job and not the browser's.",
    tone: "green",
  },
  {
    when: "all seven are missing, and Chromium is there",
    outcome: "re-rendered headless, then judged",
    detail:
      "The textbook SPA shape. goflag renders the page and reparses, so a client-rendered site is not reported as missing everything it actually serves.",
    tone: "yellow",
  },
  {
    when: "all seven are missing, and Chromium is not",
    outcome: "judged on the static HTML, and the report says so",
    detail:
      "playwright is an optional peer dependency, so this is not an error. The run records why it could not escalate and build.ts turns that into a diagnostics warning — judging an unhydrated shell produces a page of findings that are all false, and the reader has no way to know unless the report says it.",
    tone: "red",
  },
];

const TONE: Record<"green" | "yellow" | "red", string> = {
  green: "border-flag-green/50 bg-flag-green/5",
  yellow: "border-flag-yellow/50 bg-flag-yellow/5",
  red: "border-flag-red/50 bg-flag-red/5",
};

export function ChromiumTree() {
  return (
    <figure className="not-prose border-border my-8 rounded-lg border p-4 sm:p-6">
      <figcaption className="text-muted-foreground mb-5 text-sm">
        goflag escalates to a browser only when <strong className="text-foreground">every</strong>{" "}
        discriminating signal is missing. The conjunction is the whole decision — one surviving tag
        keeps the page on the static path.
      </figcaption>

      <div className="mb-5">
        <p className="text-muted-foreground mb-2 font-mono text-xs tracking-wide uppercase">
          all seven missing?
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {CHROMIUM_SIGNALS.map((signal) => (
            <li
              key={signal.label}
              className="border-border bg-muted/30 flex flex-col rounded border px-3 py-2"
            >
              <span className="font-mono text-xs font-medium">{signal.label}</span>
              <span className="text-muted-foreground text-xs">{signal.detail}</span>
            </li>
          ))}
        </ul>
      </div>

      <ol className="flex flex-col gap-2">
        {CHROMIUM_OUTCOMES.map((outcome) => (
          <li
            key={outcome.when}
            className={cn(
              "flex flex-col gap-1 rounded border-l-2 py-2 pr-3 pl-4",
              TONE[outcome.tone],
            )}
          >
            <span className="text-muted-foreground font-mono text-xs">{outcome.when}</span>
            <span className="text-sm font-medium">{outcome.outcome}</span>
            <span className="text-muted-foreground text-xs">{outcome.detail}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
