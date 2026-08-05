/**
 * The shape of the switcher under the headline: what goflag prevents, then the
 * four checks. The words live in `messages/*.json` under `home.workflow`; this
 * file holds only what is the same in every language.
 *
 * The first tab and the other four are deliberately different shapes. Forcing one
 * diagram on both was the mistake in the first draft: `input → check → output`
 * describes how a thing works, and the opening tab has to answer why anyone
 * should care before there is any interest in the how. So the first tab is two
 * timelines of the same commit, and the other four keep the pipeline, because for
 * them the pipeline is the honest description.
 *
 * ## What may go in the copy
 *
 * Accuracy first: every identifier, rule id and count is read out of
 * `packages/cli/src/lib/core` and `src/lib/rules`, not written to sound
 * plausible. Nothing claims a capability the engine does not have — in
 * particular robots.txt is only checked for a whole-site `Disallow: /` that
 * contradicts pages asking to be indexed, never per path.
 *
 * Then brevity, which is the harder one. This has to be legible in about three
 * seconds, so a stage gets one line about what it does and at most two about
 * what comes out. The mechanism that earns trust — HEAD before GET, three
 * requests per host, why `x-default` never fills a hole — is true, and it
 * belongs further down the page where someone is reading rather than scanning.
 *
 * ## Literal or translated
 *
 * A string stays here, verbatim in every locale, when translating it would make
 * it wrong: identifiers (`brokenLinks[]`), flags (`--locales …`), markup
 * (`<head>`) and printed output (`[404] /ghost`). A French reader needs to
 * recognise those in their own terminal, and `<head>` cannot go through
 * `next-intl` anyway — ICU parses the angle brackets as tags and throws.
 *
 * Everything else is prose and belongs in the message files, keyed as
 * `home.workflow.<flowId>.…`. The two are never mixed on one string: `titleLiteral`
 * and a translated title are alternatives, and a row carries either `literal` or
 * an `id`.
 */

/** Where a stage sits: what it is handed, what it does, what it emits. */
export type StageKind = "input" | "work" | "output";

export type StageRow = {
  /** The severity the CLI would print this at. The only colour in the diagram. */
  tone?: "green" | "yellow" | "red";
  /** Rendered mono: an identifier, a flag, a status line. */
  code?: boolean;
  /** A caption under the results rather than one of them. No bullet. */
  note?: boolean;
} & (
  | { id: string; literal?: never }
  | {
      literal: string;
      id?: never;
    }
);

export interface Stage {
  kind: StageKind;
  /** When absent, the title comes from `…stages.<kind>.title`. */
  titleLiteral?: string;
  rows: readonly StageRow[];
}

export type StepIcon = "tag" | "ship" | "unseen" | "falling" | "flag" | "fix" | "clean";

/**
 * One beat on a timeline. Its four strings — title, chip label, detail and the
 * elapsed time that carries the whole argument — live under
 * `…<trackId>.<stepId>`.
 */
export interface Step {
  id: string;
  icon: StepIcon;
}

export interface Track {
  id: string;
  /** `cost` is the timeline you are on today; `saved` is the one goflag puts you on. */
  tone: "cost" | "saved";
  /**
   * Both tracks run the same number of beats, and they have to: the comparison
   * is between two endings, not between a long story and a short one. Step three
   * of one is someone asking why traffic fell and step three of the other is the
   * page doing its job, in the same three moves.
   */
  steps: readonly [Step, Step, Step];
}

export type FlowIcon = "shield" | "link" | "languages" | "robots" | "tags";

interface FlowBase {
  id: string;
  icon: FlowIcon;
}

export type Flow =
  | (FlowBase & {
      kind: "fork";
      /** The one commit both tracks start from. Keyed as `…origin`. */
      origin: Step;
      tracks: readonly [Track, Track];
    })
  | (FlowBase & {
      kind: "stages";
      stages: readonly [Stage, Stage, Stage];
    });

export const FLOWS: readonly Flow[] = [
  /**
   * The same commit, on two timelines.
   *
   * Nothing in here names a flag, a format or a rule, because none of that is why
   * anyone would want this. The argument is made by the shape: three beats on each
   * track, aligned column for column, so the two endings sit side by side and the
   * only variable is whether anything read the page before it shipped.
   *
   * The second track deliberately does not stop at the alert. Being told a CI step
   * failed is a cost, not a benefit, and a diagram that ends there is selling the
   * interruption rather than the outcome. It ends where the reader actually wants
   * to be: the tag fixed, the page indexed, the shared link rendering its preview
   * — all of it still on day 0.
   */
  {
    id: "prevents",
    icon: "shield",
    kind: "fork",
    origin: { id: "origin", icon: "tag" },
    tracks: [
      {
        id: "without",
        tone: "cost",
        steps: [
          { id: "shipped", icon: "ship" },
          { id: "unnoticed", icon: "unseen" },
          { id: "tooLate", icon: "falling" },
        ],
      },
      {
        id: "with",
        tone: "saved",
        steps: [
          { id: "flagged", icon: "flag" },
          { id: "fixed", icon: "fix" },
          { id: "clean", icon: "clean" },
        ],
      },
    ],
  },
  {
    id: "links",
    icon: "link",
    kind: "stages",
    stages: [
      { kind: "input", titleLiteral: "Every <a href>", rows: [{ id: "crawled" }] },
      { kind: "work", rows: [{ id: "deduped" }] },
      {
        kind: "output",
        titleLiteral: "brokenLinks[]",
        rows: [
          { literal: "[404] /ghost", code: true, tone: "red" },
          { literal: "[blocked 403] /members", code: true, tone: "yellow" },
          { id: "mapped", note: true },
        ],
      },
    ],
  },
  {
    id: "i18n",
    icon: "languages",
    kind: "stages",
    stages: [
      { kind: "input", rows: [{ literal: "--locales en,fr,es,pt-br", code: true }] },
      { kind: "work", rows: [{ id: "cells" }] },
      {
        kind: "output",
        titleLiteral: "missingTranslations",
        rows: [
          { literal: "/about — missing es (has en, fr)", code: true, tone: "yellow" },
          { id: "declared", note: true },
        ],
      },
    ],
  },
  {
    id: "robots",
    icon: "robots",
    kind: "stages",
    stages: [
      { kind: "input", rows: [{ id: "together" }] },
      { kind: "work", rows: [{ id: "contradiction" }] },
      {
        kind: "output",
        titleLiteral: "robots.blocks-site",
        rows: [
          { id: "wins", code: true, tone: "red" },
          { id: "severity", note: true },
        ],
      },
    ],
  },
  {
    id: "metadata",
    icon: "tags",
    kind: "stages",
    stages: [
      {
        kind: "input",
        titleLiteral: "The <head>",
        rows: [{ literal: "title, description, canonical, og:*", code: true }],
      },
      { kind: "work", rows: [{ id: "split" }] },
      {
        kind: "output",
        titleLiteral: "seoIssues[]",
        rows: [
          { literal: "error title.missing", code: true, tone: "red" },
          { literal: "warning description.length", code: true, tone: "yellow" },
          { id: "snippet", note: true },
        ],
      },
    ],
  },
] as const;
